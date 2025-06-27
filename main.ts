import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile, moment } from 'obsidian';

interface ReminderPluginSettings {
	apiBaseUrl: string;
	apiPassword: string;
	defaultReminderMinutes: number;
	enableNotifications: boolean;
	userTimezone: string;
	language: string;
}

const DEFAULT_SETTINGS: ReminderPluginSettings = {
	apiBaseUrl: 'https://flexreminder.com/api',
	apiPassword: 'api_password_app',
	defaultReminderMinutes: 5,
	enableNotifications: true,
	userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	language: 'ar'
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
}

interface ApiResponse {
	success: boolean;
	message: string;
	title?: string;
	id?: number;
	nextReminderTime?: string;
	is_playlist?: boolean;
	video_belongs_to_playlist?: boolean;
}

export default class ReminderPlugin extends Plugin {
	settings: ReminderPluginSettings;
	activeReminders: Map<string, NodeJS.Timeout> = new Map();
	reminderStorage: ReminderData[] = [];

	async onload() {
		await this.loadSettings();
		await this.loadReminders();

		// إضافة أيقونة في الشريط الجانبي
		const ribbonIconEl = this.addRibbonIcon('clock', 'إضافة تذكير من رابط', (evt: MouseEvent) => {
			new LinkReminderModal(this.app, this).open();
		});
		ribbonIconEl.addClass('reminder-plugin-ribbon-class');

		// إضافة عنصر في شريط الحالة
		const statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar(statusBarItemEl);

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
					// البحث عن رابط في النص المحدد
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

		// إضافة تبويب الإعدادات
		this.addSettingTab(new ReminderSettingTab(this.app, this));

		// استعادة التذكيرات النشطة عند تحميل البرنامج
		this.restoreActiveReminders();

		// مزامنة دورية كل 30 دقيقة
		this.registerInterval(window.setInterval(() => {
			this.syncRemindersWithApi();
		}, 30 * 60 * 1000));
	}

	onunload() {
		// إلغاء جميع التذكيرات النشطة
		this.activeReminders.forEach(timeout => clearTimeout(timeout));
		this.activeReminders.clear();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async loadReminders() {
		const data = await this.loadData();
		this.reminderStorage = data?.reminders || [];
	}

	async saveReminders() {
		const data = await this.loadData() || {};
		data.reminders = this.reminderStorage;
		await this.saveData(data);
	}

	async sendUrlToApi(url: string, importance: string = 'day'): Promise<ApiResponse> {
		try {
			const timezoneOffset = new Date().getTimezoneOffset().toString();
			
			const response = await fetch(`${this.settings.apiBaseUrl}/savePost`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.apiPassword}`,
					'Accept': 'application/json'
				},
				body: JSON.stringify({ 
					url,
					importance_en: importance,
					importance_ar: this.getImportanceArabic(importance),
					timezone_offset: timezoneOffset,
					timezone_name: this.settings.userTimezone,
					api: 'obsidian'
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
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
			
			const response = await fetch(`${this.settings.apiBaseUrl}/updateReminder`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.settings.apiPassword}`,
					'Accept': 'application/json'
				},
				body: JSON.stringify({
					id: apiId,
					next_reminder_time: newTime.toISOString(),
					timezone_offset: timezoneOffset,
					timezone_name: this.settings.userTimezone
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			return data.success;
		} catch (error) {
			console.error('خطأ في تحديث وقت التذكير:', error);
			return false;
		}
	}

	async deleteReminderFromApi(apiId: number): Promise<boolean> {
		try {
			const response = await fetch(`${this.settings.apiBaseUrl}/deleteReminder/${apiId}`, {
				method: 'DELETE',
				headers: {
					'Authorization': `Bearer ${this.settings.apiPassword}`,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			return data.success;
		} catch (error) {
			console.error('خطأ في حذف التذكير من API:', error);
			return false;
		}
	}

	async syncRemindersWithApi(): Promise<void> {
		try {
			const response = await fetch(`${this.settings.apiBaseUrl}/getReminders`, {
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${this.settings.apiPassword}`,
					'Accept': 'application/json'
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const data = await response.json();
			if (data.success && data.reminders) {
				// تحديث التذكيرات المحلية بناءً على البيانات من الخادم
				this.updateLocalRemindersFromApi(data.reminders);
			}
		} catch (error) {
			console.error('خطأ في مزامنة التذكيرات:', error);
		}
	}

	private updateLocalRemindersFromApi(apiReminders: any[]) {
		// تحديث التذكيرات الموجودة وإضافة الجديدة
		apiReminders.forEach(apiReminder => {
			const existingIndex = this.reminderStorage.findIndex(r => r.apiId === apiReminder.id);
			
			if (existingIndex !== -1) {
				// تحديث التذكير الموجود
				this.reminderStorage[existingIndex].reminderTime = new Date(apiReminder.next_reminder_time);
				this.reminderStorage[existingIndex].title = apiReminder.title;
				this.reminderStorage[existingIndex].category = apiReminder.category;
				this.reminderStorage[existingIndex].complexity = apiReminder.complexity;
				this.reminderStorage[existingIndex].domain = apiReminder.domain;
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
					domain: apiReminder.domain
				};
				this.reminderStorage.push(newReminder);
			}
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
			importance
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

		return reminderId;
	}

	triggerReminder(reminder: ReminderData) {
		if (this.settings.enableNotifications) {
			new Notice(`🔔 تذكير: ${reminder.title}`, 10000);
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
			isActive: true
		};

		this.reminderStorage.push(newReminder);
		await this.saveReminders();

		const timeUntilReminder = snoozeTime.getTime() - Date.now();
		const timeout = setTimeout(() => {
			this.triggerReminder(newReminder);
		}, timeUntilReminder);

		this.activeReminders.set(newReminderId, timeout);
		new Notice(`تم تأجيل التذكير لمدة ${minutes} دقيقة`);
	}

	getActiveReminders(): ReminderData[] {
		return this.reminderStorage.filter(r => r.isActive);
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
	}

	private updateStatusBar(statusBarItem: HTMLElement) {
		const activeCount = this.getActiveReminders().length;
		statusBarItem.setText(`🔔 ${activeCount} تذكير نشط`);
		
		// تحديث كل دقيقة
		setTimeout(() => this.updateStatusBar(statusBarItem), 60000);
	}

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	private getImportanceArabic(importance: string): string {
		const importanceMap: { [key: string]: string } = {
			'day': 'يوم',
			'week': 'أسبوع',
			'month': 'شهر'
		};
		return importanceMap[importance] || 'يوم';
	}
}

class LinkReminderModal extends Modal {
	plugin: ReminderPlugin;
	initialUrl: string;

	constructor(app: App, plugin: ReminderPlugin, initialUrl?: string) {
		super(app);
		this.plugin = plugin;
		this.initialUrl = initialUrl || '';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'إضافة تذكير من رابط' });

		// حقل إدخال الرابط
		const urlContainer = contentEl.createDiv('reminder-input-container');
		urlContainer.createEl('label', { text: 'الرابط:' });
		const urlInput = urlContainer.createEl('input', {
			type: 'text',
			placeholder: 'https://example.com',
			value: this.initialUrl
		});
		urlInput.addClass('reminder-url-input');

		// حقل العنوان (اختياري)
		const titleContainer = contentEl.createDiv('reminder-input-container');
		titleContainer.createEl('label', { text: 'العنوان (اختياري):' });
		const titleInput = titleContainer.createEl('input', {
			type: 'text',
			placeholder: 'عنوان التذكير'
		});
		titleInput.addClass('reminder-title-input');

		// حقل الأهمية
		const importanceContainer = contentEl.createDiv('reminder-input-container');
		importanceContainer.createEl('label', { text: 'الأهمية:' });
		const importanceSelect = importanceContainer.createEl('select');
		importanceSelect.addClass('reminder-importance-select');
		
		const importanceOptions = [
			{ value: 'day', text: 'يومي' },
			{ value: 'week', text: 'أسبوعي' },
			{ value: 'month', text: 'شهري' }
		];
		
		importanceOptions.forEach(option => {
			const optionEl = importanceSelect.createEl('option', { 
				value: option.value, 
				text: option.text 
			});
		});

		// حقل الوقت المخصص (اختياري)
		const timeContainer = contentEl.createDiv('reminder-input-container');
		timeContainer.createEl('label', { text: 'وقت مخصص (اختياري):' });
		const timeInput = timeContainer.createEl('input', {
			type: 'datetime-local'
		});
		timeInput.addClass('reminder-time-input');

		// أزرار العمل
		const buttonContainer = contentEl.createDiv('reminder-button-container');
		
		const createButton = buttonContainer.createEl('button', { text: 'إنشاء تذكير' });
		createButton.addClass('mod-cta');
		createButton.onclick = async () => {
			await this.handleCreateReminder(
				urlInput.value, 
				titleInput.value, 
				timeInput.value,
				importanceSelect.value
			);
		};

		const cancelButton = buttonContainer.createEl('button', { text: 'إلغاء' });
		cancelButton.onclick = () => this.close();

		// التركيز على حقل الرابط
		urlInput.focus();
	}

	async handleCreateReminder(url: string, customTitle: string, customTime: string, importance: string) {
		if (!url.trim()) {
			new Notice('يرجى إدخال رابط صحيح');
			return;
		}

		// التحقق من صحة الرابط
		try {
			new URL(url);
		} catch {
			new Notice('الرابط المدخل غير صحيح');
			return;
		}

		// عرض رسالة تحميل
		const loadingNotice = new Notice('جاري معالجة الرابط...', 0);

		try {
			let reminderTime: Date;
			let title: string;

			if (customTime) {
				// استخدام الوقت المخصص
				reminderTime = new Date(customTime);
				title = customTitle || 'تذكير مخصص';
				
				// التحقق من أن الوقت في المستقبل
				if (reminderTime <= new Date()) {
					throw new Error('وقت التذكير يجب أن يكون في المستقبل');
				}

				// إنشاء التذكير مع الوقت المخصص
				const reminderId = await this.plugin.createReminder(url, title, reminderTime, importance);
			} else {
				// إنشاء التذكير باستخدام API
				const reminderId = await this.plugin.createReminder(
					url, 
					customTitle || 'تذكير من رابط', 
					new Date(), 
					importance
				);
			}

			loadingNotice.hide();
			new Notice('تم إنشاء التذكير بنجاح!');
			
			this.close();
		} catch (error) {
			loadingNotice.hide();
			new Notice(`خطأ: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ActiveRemindersModal extends Modal {
	plugin: ReminderPlugin;

	constructor(app: App, plugin: ReminderPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'التذكيرات النشطة' });

		const activeReminders = this.plugin.getActiveReminders();

		if (activeReminders.length === 0) {
			contentEl.createEl('p', { text: 'لا توجد تذكيرات نشطة حالياً' });
			
			// زر لمزامنة التذكيرات
			const syncButton = contentEl.createEl('button', { text: 'مزامنة مع الخادم' });
			syncButton.addClass('mod-cta');
			syncButton.onclick = async () => {
				const loadingNotice = new Notice('جاري المزامنة...', 0);
				await this.plugin.syncRemindersWithApi();
				loadingNotice.hide();
				new Notice('تم تحديث التذكيرات');
				this.onOpen(); // إعادة تحديث القائمة
			};
			
			return;
		}

		const remindersList = contentEl.createDiv('reminders-list');

		activeReminders.forEach(reminder => {
			const reminderItem = remindersList.createDiv('reminder-item');
			
			const reminderInfo = reminderItem.createDiv('reminder-info');
			reminderInfo.createEl('h3', { text: reminder.title });
			reminderInfo.createEl('p', { text: `الرابط: ${reminder.url}` });
			reminderInfo.createEl('p', { text: `الوقت: ${new Date(reminder.reminderTime).toLocaleString('ar')}` });
			
			if (reminder.importance) {
				reminderInfo.createEl('p', { text: `الأهمية: ${this.plugin.getImportanceArabic(reminder.importance)}` });
			}
			
			if (reminder.category) {
				reminderInfo.createEl('p', { text: `الفئة: ${reminder.category}` });
			}

			const reminderActions = reminderItem.createDiv('reminder-actions');
			
			const openButton = reminderActions.createEl('button', { text: 'فتح الرابط' });
			openButton.onclick = () => {
				window.open(reminder.url, '_blank');
			};

			const snoozeButton = reminderActions.createEl('button', { text: 'تأجيل 5 دقائق' });
			snoozeButton.onclick = async () => {
				await this.plugin.snoozeReminder(reminder, 5);
				this.onOpen(); // إعادة تحديث القائمة
			};

			const cancelButton = reminderActions.createEl('button', { text: 'إلغاء التذكير' });
			cancelButton.addClass('mod-warning');
			cancelButton.onclick = async () => {
				await this.plugin.cancelReminder(reminder.id);
				new Notice('تم إلغاء التذكير');
				this.onOpen(); // إعادة تحديث القائمة
			};
		});

		// زر مزامنة في الأسفل
		const syncContainer = contentEl.createDiv('reminder-sync-container');
		const syncButton = syncContainer.createEl('button', { text: 'مزامنة مع الخادم' });
		syncButton.onclick = async () => {
			const loadingNotice = new Notice('جاري المزامنة...', 0);
			await this.plugin.syncRemindersWithApi();
			loadingNotice.hide();
			new Notice('تم تحديث التذكيرات');
			this.onOpen(); // إعادة تحديث القائمة
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ReminderNotificationModal extends Modal {
	reminder: ReminderData;
	plugin: ReminderPlugin;

	constructor(app: App, reminder: ReminderData, plugin: ReminderPlugin) {
		super(app);
		this.reminder = reminder;
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.addClass('reminder-notification-modal');

		const header = contentEl.createDiv('reminder-notification-header');
		header.createEl('h1', { text: '🔔 تذكير!' });

		const content = contentEl.createDiv('reminder-notification-content');
		content.createEl('h2', { text: this.reminder.title });
		content.createEl('p', { text: `الرابط: ${this.reminder.url}` });
		content.createEl('p', { text: `الوقت: ${new Date(this.reminder.reminderTime).toLocaleString('ar')}` });
		
		if (this.reminder.category) {
			content.createEl('p', { text: `الفئة: ${this.reminder.category}` });
		}
		
		if (this.reminder.complexity) {
			content.createEl('p', { text: `التعقيد: ${this.reminder.complexity}` });
		}

		const actions = contentEl.createDiv('reminder-notification-actions');
		
		const openButton = actions.createEl('button', { text: 'فتح الرابط' });
		openButton.addClass('mod-cta');
		openButton.onclick = () => {
			window.open(this.reminder.url, '_blank');
			this.close();
		};

		const snooze5Button = actions.createEl('button', { text: 'تأجيل 5 دقائق' });
		snooze5Button.onclick = async () => {
			await this.plugin.snoozeReminder(this.reminder, 5);
			this.close();
		};

		const snooze15Button = actions.createEl('button', { text: 'تأجيل 15 دقيقة' });
		snooze15Button.onclick = async () => {
			await this.plugin.snoozeReminder(this.reminder, 15);
			this.close();
		};

		const snooze60Button = actions.createEl('button', { text: 'تأجيل ساعة' });
		snooze60Button.onclick = async () => {
			await this.plugin.snoozeReminder(this.reminder, 60);
			this.close();
		};

		const dismissButton = actions.createEl('button', { text: 'تجاهل' });
		dismissButton.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class ReminderSettingTab extends PluginSettingTab {
	plugin: ReminderPlugin;

	constructor(app: App, plugin: ReminderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'إعدادات التذكيرات' });

		new Setting(containerEl)
			.setName('رابط API الأساسي')
			.setDesc('الرابط الأساسي لـ API الخاص بك')
			.addText(text => text
				.setPlaceholder('https://flexreminder.com/api')
				.setValue(this.plugin.settings.apiBaseUrl)
				.onChange(async (value) => {
					this.plugin.settings.apiBaseUrl = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('كلمة مرور API')
			.setDesc('كلمة المرور للوصول إلى API')
			.addText(text => {
				text.inputEl.type = 'password';
				text.setPlaceholder('كلمة مرور API')
					.setValue(this.plugin.settings.apiPassword)
					.onChange(async (value) => {
						this.plugin.settings.apiPassword = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName('المنطقة الزمنية')
			.setDesc('المنطقة الزمنية الخاصة بك')
			.addText(text => text
				.setPlaceholder('Asia/Riyadh')
				.setValue(this.plugin.settings.userTimezone)
				.onChange(async (value) => {
					this.plugin.settings.userTimezone = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('اللغة')
			.setDesc('لغة واجهة التطبيق')
			.addDropdown(dropdown => dropdown
				.addOption('ar', 'العربية')
				.addOption('en', 'English')
				.addOption('zh', '中文')
				.setValue(this.plugin.settings.language)
				.onChange(async (value) => {
					this.plugin.settings.language = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('تفعيل الإشعارات')
			.setDesc('عرض إشعارات عند تفعيل التذكيرات')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableNotifications)
				.onChange(async (value) => {
					this.plugin.settings.enableNotifications = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('دقائق التذكير الافتراضية')
			.setDesc('عدد الدقائق الافتراضي للتذكيرات المخصصة')
			.addSlider(slider => slider
				.setLimits(1, 60, 1)
				.setValue(this.plugin.settings.defaultReminderMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.defaultReminderMinutes = value;
					await this.plugin.saveSettings();
				}));

		// قسم إحصائيات
		containerEl.createEl('h3', { text: 'الإحصائيات' });
		
		const activeReminders = this.plugin.getActiveReminders();
		const totalReminders = this.plugin.reminderStorage.length;
		
		const statsContainer = containerEl.createDiv('reminder-stats');
		statsContainer.createEl('p', { text: `التذكيرات النشطة: ${activeReminders.length}` });
		statsContainer.createEl('p', { text: `إجمالي التذكيرات: ${totalReminders}` });

		// زر مزامنة التذكيرات
		new Setting(containerEl)
			.setName('مزامنة التذكيرات')
			.setDesc('مزامنة التذكيرات مع الخادم')
			.addButton(button => button
				.setButtonText('مزامنة الآن')
				.onClick(async () => {
					const loadingNotice = new Notice('جاري المزامنة...', 0);
					await this.plugin.syncRemindersWithApi();
					loadingNotice.hide();
					new Notice('تم تحديث التذكيرات');
					this.display(); // إعادة تحديث الصفحة
				}));

		// زر مسح جميع التذكيرات
		new Setting(containerEl)
			.setName('مسح جميع التذكيرات')
			.setDesc('حذف جميع التذكيرات المحفوظة (لا يمكن التراجع)')
			.addButton(button => button
				.setButtonText('مسح الكل')
				.setWarning()
				.onClick(async () => {
					if (confirm('هل أنت متأكد من حذف جميع التذكيرات؟ لا يمكن التراجع عن هذا الإجراء.')) {
						// حذف من API أولاً
						for (const reminder of this.plugin.reminderStorage) {
							if (reminder.apiId) {
								await this.plugin.deleteReminderFromApi(reminder.apiId);
							}
						}
						
						// حذف محلياً
						this.plugin.activeReminders.forEach(timeout => clearTimeout(timeout));
						this.plugin.activeReminders.clear();
						this.plugin.reminderStorage = [];
						await this.plugin.saveReminders();
						new Notice('تم حذف جميع التذكيرات');
						this.display(); // إعادة تحديث الصفحة
					}
				}));
	}
}