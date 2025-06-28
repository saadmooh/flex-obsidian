import { App, Modal, Notice } from 'obsidian';
import ReminderPlugin from '../main';

export class LinkReminderModal extends Modal {
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

		// أزرار العمل
		const buttonContainer = contentEl.createDiv('reminder-button-container');
		
		const createButton = buttonContainer.createEl('button', { text: 'إنشاء تذكير' });
		createButton.addClass('mod-cta');
		createButton.onclick = async () => {
			await this.handleCreateReminder(
				urlInput.value, 
				importanceSelect.value
			);
		};

		const cancelButton = buttonContainer.createEl('button', { text: 'إلغاء' });
		cancelButton.onclick = () => this.close();

		// التركيز على حقل الرابط
		urlInput.focus();

		// إضافة مستمع للضغط على Enter
		urlInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				createButton.click();
			}
		});
	}

	async handleCreateReminder(url: string, importance: string) {
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
			// إرسال الرابط إلى API
			const timezoneOffset = new Date().getTimezoneOffset().toString();
			
			const data = await this.plugin.makeApiRequest('save-post', 'POST', {
				url: url,
				importance_en: importance,
				importance_ar: this.plugin.getImportanceArabic(importance),
				playlist_url: null,
				api: 'obsidian',
				timezone_offset: timezoneOffset,
				timezone_name: this.plugin.settings.userTimezone
			});

			if (!data.success) {
				throw new Error(data.message || 'فشل في إنشاء التذكير على الخادم');
			}

			// إنشاء التذكير المحلي
			const reminderId = this.generateId();
			const reminderData = {
				id: reminderId,
				url: url,
				title: data.title || 'تذكير من رابط',
				reminderTime: data.nextReminderTime ? new Date(data.nextReminderTime) : new Date(Date.now() + 5 * 60 * 1000),
				isActive: true,
				apiId: data.id,
				importance: importance,
				category: data.category,
				complexity: data.complexity,
				domain: data.domain,
				content: data.content,
				imageUrl: data.image_url,
				preferredTimes: data.preferred_times,
				createdAt: new Date(),
				lastSynced: new Date()
			};

			this.plugin.reminderStorage.push(reminderData);
			await this.plugin.saveReminders();

			// حساب الوقت المتبقي للتذكير
			const now = new Date();
			const timeUntilReminder = reminderData.reminderTime.getTime() - now.getTime();

			if (timeUntilReminder > 0) {
				const timeout = setTimeout(() => {
					this.plugin.triggerReminder(reminderData);
				}, timeUntilReminder);

				this.plugin.activeReminders.set(reminderId, timeout);
			}

			this.plugin.updateStatusBar();

			loadingNotice.hide();
			new Notice('تم إنشاء التذكير بنجاح!');
			
			this.close();
		} catch (error) {
			loadingNotice.hide();
			new Notice(`خطأ: ${error instanceof Error ? error.message : 'خطأ غير معروف'}`);
		}
	}

	private generateId(): string {
		return Math.random().toString(36).substr(2, 9);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}