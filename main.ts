import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';

// Import modal classes
import { LinkReminderModal } from './src/modals/LinkReminderModal';
import { ActiveRemindersModal } from './src/modals/ActiveRemindersModal';
import { ReminderNotificationModal } from './src/modals/ReminderNotificationModal';
import { ReminderStatsModal } from './src/modals/ReminderStatsModal';
import { SearchRemindersModal } from './src/modals/SearchRemindersModal';

// Import settings tab
import { ReminderSettingTab } from './src/settings/ReminderSettingTab';

interface ReminderPluginSettings {
	apiBaseUrl: string;
	apiPassword: string;
	defaultReminderMinutes: number;
	enableNotifications: boolean;
	userTimezone: string;
	language: string;
	enableAutoSync: boolean;
	syncIntervalMinutes: number;
	enableSoundNotifications: boolean;
	maxRetries: number;
}

const DEFAULT_SETTINGS: ReminderPluginSettings = {
	apiBaseUrl: 'https://flexreminder.com/api',
	apiPassword: 'api_password_app',
	defaultReminderMinutes: 5,
	enableNotifications: true,
	userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	language: 'ar',
	enableAutoSync: true,
	syncIntervalMinutes: 30,
	enableSoundNotifications: false,
	maxRetries: 3
}

interface ReminderData {
	id: string;
	url: string;
	title: string;
	reminderTime: Date;
	isActive: boolean;
	apiId?: number;
	importance?: string;
	category?: string;
	complexity?: string;
	domain?: string;
	content?: string;
	imageUrl?: string;
	preferredTimes?: string;
	createdAt?: Date;
	lastSynced?: Date;
}

interface ApiResponse {
	success: boolean;
	message: string;
	title?: string;
	id?: number;
	nextReminderTime?: string;
	is_playlist?: boolean;
	video_belongs_to_playlist?: boolean;
	category?: string;
	complexity?: string;
	domain?: string;
	content?: string;
	image_url?: string;
	preferred_times?: string;
}

interface SyncStatus {
	isOnline: boolean;
	lastSyncTime: Date | null;
	pendingChanges: number;
	syncInProgress: boolean;
}

export default class ReminderPlugin extends Plugin {
	settings: ReminderPluginSettings;
	activeReminders: Map<string, NodeJS.Timeout> = new Map();
	reminderStorage: ReminderData[] = [];
	syncStatus: SyncStatus = {
		isOnline: true,
		lastSyncTime: null,
		pendingChanges: 0,
		syncInProgress: false
	};
	statusBarItem: HTMLElement | null = null;
	syncInterval: number | null = null;

	async onload() {
		await this.loadSettings();
		await this.loadReminders();

		// إضافة أيقونة في الشريط الجانبي
		const ribbonIconEl = this.addRibbonIcon('clock', 'إضافة تذكير من رابط', (evt: MouseEvent) => {
			new LinkReminderModal(this.app, this).open();
		});
		ribbonIconEl.addClass('reminder-plugin-ribbon-class');

		// إضافة عنصر في شريط الحالة
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatusBar();

		// إضافة الأوامر
		this.addCommands();

		// إضافة تبويب الإعدادات
		this.addSettingTab(new ReminderSettingTab(this.app, this));

		// استعادة التذكيرات النشطة عند تحميل البرنامج
		this.restoreActiveReminders();

		// بدء المزامنة التلقائية
		this.startAutoSync();

		// فحص الاتصال بالإنترنت
		this.checkConnectivity();
	}

	onunload() {
		// إلغاء جميع التذكيرات النشطة
		this.activeReminders.forEach(timeout => clearTimeout(timeout));
		this.activeReminders.clear();

		// إيقاف المزامنة التلقائية
		this.stopAutoSync();
	}

	private addCommands() {
		// إضافة أمر لفتح نافذة إضافة تذكير
		this.addCommand({
			id: 'add-link-reminder',
			name: 'إضافة تذكير من رابط',
			callback: () => {
				new LinkReminderModal(this.app, this).open();
			}
		});

		// إضافة أمر لعرض التذكيرات النشطة
		this.addCommand({
			id: 'view-active-reminders',
			name: 'عرض التذكيرات النشطة',
			callback: () => {
				new ActiveRemindersModal(this.app, this).open();
			}
		});

		// إضافة أمر للتذكير من النص المحدد
		this.addCommand({
			id: 'create-reminder-from-selection',
			name: 'إنشاء تذكير من النص المحدد',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				const selection = editor.getSelection();
				if (selection) {
					const urlRegex = /(https?:\/\/[^\s]+)/g;
					const match = selection.match(urlRegex);
					if (match && match[0]) {
						new LinkReminderModal(this.app, this, match[0]).open();
					} else {
						new Notice('لم يتم العثور على رابط في النص المحدد');
					}
				} else {
					new Notice('يرجى تحديد نص يحتوي على رابط');
				}
			}
		});

		// إضافة أمر لمزامنة التذكيرات مع API
		this.addCommand({
			id: 'sync-reminders',
			name: 'مزامنة التذكيرات مع الخادم',
			callback: () => {
				this.syncRemindersWithApi();
			}
		});

		// إضافة أمر لعرض إحصائيات التذكيرات
		this.addCommand({
			id: 'view-reminder-stats',
			name: 'عرض إحصائيات التذكيرات',
			callback: () => {
				new ReminderStatsModal(this.app, this).open();
			}
		});

		// إضافة أمر للبحث في التذكيرات
		this.addCommand({
			id: 'search-reminders',
			name: 'البحث في التذكيرات',
			callback: () => {
				new SearchRemindersModal(this.app, this).open();
			}
		});
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadReminders() {
		const data = await this.loadData();
		this.reminderStorage = (data?.reminders || []).map((reminder: any) => ({
			...reminder,
			reminderTime: new Date(reminder.reminderTime),
			createdAt: reminder.createdAt ? new Date(reminder.createdAt) : new Date(),
			lastSynced: reminder.lastSynced ? new Date(reminder.lastSynced) : null
		}));
	}

	async saveReminders() {
		const data = await this.loadData() || {};
		data.reminders = this.reminderStorage;
		await this.saveData(data);
	}

	private async makeApiRequest(endpoint: string, method: string = 'GET', body?: any): Promise<any> {
		const maxRetries = this.settings.maxRetries;
		let lastError: Error | null = null;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const response = await fetch(`${this.settings.apiBaseUrl}/${endpoint}`, {
					method,
					headers: {
						'Content-Type': 'application/json',
						'Authorization': `Bearer ${this.settings.apiPassword}`,
						'Accept': 'application/json'
					},
					body: body ? JSON.stringify(body) : undefined
				});

				if (!response.ok) {
					throw new Error(`HTTP error! status: ${response.status}`);
				}

				const data = await response.json();
				this.syncStatus.isOnline = true;
				return data;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('خطأ غير معروف');
				
				if (attempt === maxRetries) {
					this.syncStatus.isOnline = false;
					console.error(`فشل في الطلب بعد ${maxRetries} محاولات:`, lastError);
					break;
				}
				
				// انتظار قبل المحاولة التالية
				await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
			}
		}

		throw lastError || new Error('فشل في الاتصال بالخادم');
	}

	async sendUrlToApi(url: string, importance: string = 'day'): Promise<ApiResponse> {
		try {
			const timezoneOffset = new Date().getTimezoneOffset().toString();
			
			const data = await this.makeApiRequest('save-post', 'POST', {
				url,
				importance_en: importance,
				importance_ar: this.getImportanceArabic(importance),
				timezone_offset: timezoneOffset,
				timezone_name: this.settings.userTimezone,
				api: 'obsidian'
			});

			return data;
		} catch (error) {
			console.error('خطأ في إرسال الرابط إلى API:', error);
			return {
				success: false,
				message: error instanceof Error ? error.message : 'خطأ غير معروف'
			};
		}
	}

	async updateReminderTime(apiId: number, newTime: Date): Promise<boolean> {
		try {
			const timezoneOffset = new Date().getTimezoneOffset().toString();
			
			const data = await this.makeApiRequest('update-reminder', 'POST', {
				id: apiId,
				next_reminder_time: newTime.toISOString(),
				timezone_offset: timezoneOffset,
				timezone_name: this.settings.userTimezone
			});

			return data.success;
		} catch (error) {
			console.error('خطأ في تحديث وقت التذكير:', error);
			return false;
		}
	}

	async deleteReminderFromApi(apiId: number): Promise<boolean> {
		try {
			const data = await this.makeApiRequest(`deleteReminder/${apiId}`, 'GET');
			return data.success;
		} catch (error) {
			console.error('خطأ في حذف التذكير من API:', error);
			return false;
		}
	}

	async syncRemindersWithApi(): Promise<void> {
		if (this.syncStatus.syncInProgress) {
			return;
		}

		this.syncStatus.syncInProgress = true;
		this.updateStatusBar();

		try {
			const data = await this.makeApiRequest('reminders');
			
			if (data.success && data.reminders) {
				this.updateLocalRemindersFromApi(data.reminders);
				this.syncStatus.lastSyncTime = new Date();
				this.syncStatus.pendingChanges = 0;
				
				if (this.settings.enableNotifications) {
					new Notice('تم تحديث التذكيرات بنجاح');
				}
			}
		} catch (error) {
			console.error('خطأ في مزامنة التذكيرات:', error);
			if (this.settings.enableNotifications) {
				new Notice('فشل في مزامنة التذكيرات - سيتم المحاولة لاحقاً');
			}
		} finally {
			this.syncStatus.syncInProgress = false;
			this.updateStatusBar();
		}
	}

	private updateLocalRemindersFromApi(apiReminders: any[]) {
		const updatedIds = new Set<number>();

		apiReminders.forEach(apiReminder => {
			updatedIds.add(apiReminder.id);
			const existingIndex = this.reminderStorage.findIndex(r => r.apiId === apiReminder.id);
			
			if (existingIndex !== -1) {
				// تحديث التذكير الموجود
				const existing = this.reminderStorage[existingIndex];
				this.reminderStorage[existingIndex] = {
					...existing,
					reminderTime: new Date(apiReminder.next_reminder_time),
					title: apiReminder.title,
					category: apiReminder.category,
					complexity: apiReminder.complexity,
					domain: apiReminder.domain,
					content: apiReminder.content,
					imageUrl: apiReminder.image_url,
					preferredTimes: apiReminder.preferred_times,
					lastSynced: new Date()
				};
			} else {
				// إضافة تذكير جديد
				const newReminder: ReminderData = {
					id: this.generateId(),
					url: apiReminder.url,
					title: apiReminder.title,
					reminderTime: new Date(apiReminder.next_reminder_time),
					isActive: true,
					apiId: apiReminder.id,
					importance: apiReminder.importance,
					category: apiReminder.category,
					complexity: apiReminder.complexity,
					domain: apiReminder.domain,
					content: apiReminder.content,
					imageUrl: apiReminder.image_url,
					preferredTimes: apiReminder.preferred_times,
					createdAt: new Date(),
					lastSynced: new Date()
				};
				this.reminderStorage.push(newReminder);
			}
		});

		// إزالة التذكيرات التي لم تعد موجودة على الخادم
		this.reminderStorage = this.reminderStorage.filter(reminder => {
			if (reminder.apiId && !updatedIds.has(reminder.apiId)) {
				// إلغاء التذكير المحلي
				const timeout = this.activeReminders.get(reminder.id);
				if (timeout) {
					clearTimeout(timeout);
					this.activeReminders.delete(reminder.id);
				}
				return false;
			}
			return true;
		});

		this.saveReminders();
		this.restoreActiveReminders();
	}

	async createReminder(url: string, title: string, reminderTime: Date, importance: string = 'day'): Promise<string> {
		const reminderId = this.generateId();
		
		// إرسال إلى API أولاً
		const apiResponse = await this.sendUrlToApi(url, importance);
		
		if (!apiResponse.success) {
			throw new Error(apiResponse.message || 'فشل في إنشاء التذكير على الخادم');
		}

		const reminderData: ReminderData = {
			id: reminderId,
			url,
			title: apiResponse.title || title,
			reminderTime: apiResponse.nextReminderTime ? new Date(apiResponse.nextReminderTime) : reminderTime,
			isActive: true,
			apiId: apiResponse.id,
			importance,
			category: apiResponse.category,
			complexity: apiResponse.complexity,
			domain: apiResponse.domain,
			content: apiResponse.content,
			imageUrl: apiResponse.image_url,
			preferredTimes: apiResponse.preferred_times,
			createdAt: new Date(),
			lastSynced: new Date()
		};

		this.reminderStorage.push(reminderData);
		await this.saveReminders();

		// حساب الوقت المتبقي للتذكير
		const now = new Date();
		const timeUntilReminder = reminderData.reminderTime.getTime() - now.getTime();

		if (timeUntilReminder > 0) {
			const timeout = setTimeout(() => {
				this.triggerReminder(reminderData);
			}, timeUntilReminder);

			this.activeReminders.set(reminderId, timeout);
		}

		this.updateStatusBar();
		return reminderId;
	}

	triggerReminder(reminder: ReminderData) {
		if (this.settings.enableNotifications) {
			new Notice(`🔔 تذكير: ${reminder.title}`, 10000);
		}

		// تشغيل صوت إذا كان مفعلاً
		if (this.settings.enableSoundNotifications) {
			this.playNotificationSound();
		}

		// فتح نافذة التذكير
		new ReminderNotificationModal(this.app, reminder, this).open();

		// إزالة التذكير من القائمة النشطة
		this.activeReminders.delete(reminder.id);
		
		// تحديث حالة التذكير في التخزين
		const index = this.reminderStorage.findIndex(r => r.id === reminder.id);
		if (index !== -1) {
			this.reminderStorage[index].isActive = false;
			this.saveReminders();
		}

		this.updateStatusBar();
	}

	private playNotificationSound() {
		try {
			const audio = new Audio();
			audio.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7blmGgU7k9n1unEiBC13yO/eizEIHWq+8+OWT';
			audio.play().catch(() => {
				// تجاهل الأخطاء في تشغيل الصوت
			});
		} catch (error) {
			// تجاهل الأخطاء في تشغيل الصوت
		}
	}

	async cancelReminder(reminderId: string) {
		const timeout = this.activeReminders.get(reminderId);
		if (timeout) {
			clearTimeout(timeout);
			this.activeReminders.delete(reminderId);
		}

		// العثور على التذكير وحذفه من API
		const reminder = this.reminderStorage.find(r => r.id === reminderId);
		if (reminder && reminder.apiId) {
			await this.deleteReminderFromApi(reminder.apiId);
		}

		// تحديث حالة التذكير في التخزين
		const index = this.reminderStorage.findIndex(r => r.id === reminderId);
		if (index !== -1) {
			this.reminderStorage[index].isActive = false;
			this.saveReminders();
		}

		this.updateStatusBar();
	}

	async snoozeReminder(reminder: ReminderData, minutes: number = 5) {
		const snoozeTime = new Date(Date.now() + minutes * 60 * 1000);
		
		if (reminder.apiId) {
			const success = await this.updateReminderTime(reminder.apiId, snoozeTime);
			if (!success) {
				new Notice('فشل في تأجيل التذكير على الخادم');
				return;
			}
		}

		// إنشاء تذكير محلي جديد
		const newReminderId = this.generateId();
		const newReminder: ReminderData = {
			...reminder,
			id: newReminderId,
			reminderTime: snoozeTime,
			isActive: true,
			lastSynced: new Date()
		};

		this.reminderStorage.push(newReminder);
		await this.saveReminders();

		const timeUntilReminder = snoozeTime.getTime() - Date.now();
		const timeout = setTimeout(() => {
			this.triggerReminder(newReminder);
		}, timeUntilReminder);

		this.activeReminders.set(newReminderId, timeout);
		new Notice(`تم تأجيل التذكير لمدة ${minutes} دقيقة`);
		this.updateStatusBar();
	}

	getActiveReminders(): ReminderData[] {
		return this.reminderStorage.filter(r => r.isActive);
	}

	getAllReminders(): ReminderData[] {
		return this.reminderStorage;
	}

	searchReminders(query: string): ReminderData[] {
		const lowerQuery = query.toLowerCase();
		return this.reminderStorage.filter(reminder => 
			reminder.title.toLowerCase().includes(lowerQuery) ||
			reminder.url.toLowerCase().includes(lowerQuery) ||
			reminder.category?.toLowerCase().includes(lowerQuery) ||
			reminder.domain?.toLowerCase().includes(lowerQuery) ||
			reminder.content?.toLowerCase().includes(lowerQuery)
		);
	}

	getReminderStats() {
		const total = this.reminderStorage.length;
		const active = this.getActiveReminders().length;
		const completed = total - active;
		
		const categories = [...new Set(this.reminderStorage.map(r => r.category).filter(Boolean))];
		const domains = [...new Set(this.reminderStorage.map(r => r.domain).filter(Boolean))];
		const complexities = [...new Set(this.reminderStorage.map(r => r.complexity).filter(Boolean))];

		const importanceStats = {
			day: this.reminderStorage.filter(r => r.importance === 'day').length,
			week: this.reminderStorage.filter(r => r.importance === 'week').length,
			month: this.reminderStorage.filter(r => r.importance === 'month').length
		};

		return {
			total,
			active,
			completed,
			categories,
			domains,
			complexities,
			importanceStats,
			lastSyncTime: this.syncStatus.lastSyncTime,
			isOnline: this.syncStatus.isOnline
		};
	}

	private restoreActiveReminders() {
		// إلغاء التذكيرات النشطة الحالية
		this.activeReminders.forEach(timeout => clearTimeout(timeout));
		this.activeReminders.clear();

		const now = new Date();
		this.reminderStorage.forEach(reminder => {
			if (reminder.isActive && new Date(reminder.reminderTime) > now) {
				const timeUntilReminder = new Date(reminder.reminderTime).getTime() - now.getTime();
				const timeout = setTimeout(() => {
					this.triggerReminder(reminder);
				}, timeUntilReminder);

				this.activeReminders.set(reminder.id, timeout);
			}
		});

		this.updateStatusBar();
	}

	private updateStatusBar() {
		if (!this.statusBarItem) return;

		const activeCount = this.getActiveReminders().length;
		const syncIcon = this.syncStatus.syncInProgress ? '🔄' : 
						this.syncStatus.isOnline ? '🟢' : '🔴';
		
		this.statusBarItem.setText(`${syncIcon} 🔔 ${activeCount} تذكير نشط`);
		
		// تحديث كل دقيقة
		setTimeout(() => this.updateStatusBar(), 60000);
	}

	private startAutoSync() {
		if (!this.settings.enableAutoSync) return;

		this.syncInterval = window.setInterval(() => {
			this.syncRemindersWithApi();
		}, this.settings.syncIntervalMinutes * 60 * 1000);
	}

	private stopAutoSync() {
		if (this.syncInterval) {
			window.clearInterval(this.syncInterval);
			this.syncInterval = null;
		}
	}

	private async checkConnectivity() {
		try {
			await this.makeApiRequest('user');
			this.syncStatus.isOnline = true;
		} catch (error) {
			this.syncStatus.isOnline = false;
		}
		this.updateStatusBar();
	}

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	getImportanceArabic(importance: string): string {
		const importanceMap: { [key: string]: string } = {
			'day': 'يوم',
			'week': 'أسبوع',
			'month': 'شهر'
		};
		return importanceMap[importance] || 'يوم';
	}
}

export { ReminderData };