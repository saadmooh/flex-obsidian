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

		// معاينة الرابط
		const previewContainer = contentEl.createDiv('reminder-preview-container');
		const previewButton = previewContainer.createEl('button', { text: 'معاينة الرابط' });
		previewButton.onclick = () => this.previewUrl(urlInput.value, previewContainer);

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

		// إضافة مستمع للضغط على Enter
		urlInput.addEventListener('keypress', (e) => {
			if (e.key === 'Enter') {
				createButton.click();
			}
		});
	}

	private async previewUrl(url: string, container: HTMLElement) {
		if (!url.trim()) {
			new Notice('يرجى إدخال رابط صحيح');
			return;
		}

		try {
			new URL(url);
		} catch {
			new Notice('الرابط المدخل غير صحيح');
			return;
		}

		// إزالة المعاينة السابقة
		const existingPreview = container.querySelector('.url-preview');
		if (existingPreview) {
			existingPreview.remove();
		}

		const previewEl = container.createDiv('url-preview');
		previewEl.innerHTML = `
			<div class="preview-loading">جاري تحميل المعاينة...</div>
		`;

		try {
			// محاولة الحصول على معلومات الرابط من API
			const response = await this.plugin.makeApiRequest('reminder', 'GET', { url });
			
			if (response.success && response.reminder) {
				const reminder = response.reminder;
				previewEl.innerHTML = `
					<div class="preview-content">
						<h4>${reminder.title || 'بدون عنوان'}</h4>
						${reminder.image_url ? `<img src="${reminder.image_url}" alt="صورة المعاينة" style="max-width: 200px; max-height: 150px;">` : ''}
						<p><strong>الفئة:</strong> ${reminder.category || 'غير محدد'}</p>
						<p><strong>التعقيد:</strong> ${reminder.complexity || 'غير محدد'}</p>
						<p><strong>المجال:</strong> ${reminder.domain || 'غير محدد'}</p>
						${reminder.content ? `<p><strong>الوصف:</strong> ${reminder.content.substring(0, 100)}...</p>` : ''}
					</div>
				`;
			} else {
				previewEl.innerHTML = `
					<div class="preview-error">
						<p>لا يمكن تحميل معاينة الرابط</p>
						<p>سيتم إنشاء التذكير بالعنوان المخصص</p>
					</div>
				`;
			}
		} catch (error) {
			previewEl.innerHTML = `
				<div class="preview-error">
					<p>خطأ في تحميل المعاينة</p>
					<p>تحقق من الاتصال بالإنترنت</p>
				</div>
			`;
		}
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