import { App, Modal } from 'obsidian';
import ReminderPlugin, { ReminderData } from '../main';

export class ReminderNotificationModal extends Modal {
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
		
		// إضافة صورة المعاينة إذا كانت متوفرة
		if (this.reminder.imageUrl) {
			const img = content.createEl('img', {
				attr: { src: this.reminder.imageUrl, alt: 'صورة المعاينة' }
			});
			img.style.maxWidth = '300px';
			img.style.maxHeight = '200px';
			img.style.borderRadius = '8px';
			img.style.margin = '10px 0';
		}

		content.createEl('p', { text: `الرابط: ${this.reminder.url}` });
		content.createEl('p', { text: `الوقت: ${new Date(this.reminder.reminderTime).toLocaleString('ar')}` });
		
		if (this.reminder.category) {
			content.createEl('p', { text: `الفئة: ${this.reminder.category}` });
		}
		
		if (this.reminder.complexity) {
			content.createEl('p', { text: `التعقيد: ${this.reminder.complexity}` });
		}

		if (this.reminder.domain) {
			content.createEl('p', { text: `المجال: ${this.reminder.domain}` });
		}

		if (this.reminder.content) {
			const contentDiv = content.createDiv('reminder-content');
			contentDiv.createEl('h4', { text: 'الوصف:' });
			contentDiv.createEl('p', { text: this.reminder.content.substring(0, 200) + '...' });
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

		const customSnoozeButton = actions.createEl('button', { text: 'تأجيل مخصص' });
		customSnoozeButton.onclick = () => {
			this.showCustomSnoozeDialog();
		};

		const dismissButton = actions.createEl('button', { text: 'تجاهل' });
		dismissButton.onclick = () => this.close();

		// إضافة اختصارات لوحة المفاتيح
		this.scope.register(['Mod'], 'Enter', () => {
			openButton.click();
		});

		this.scope.register([], 'Escape', () => {
			this.close();
		});

		this.scope.register([], '1', () => {
			snooze5Button.click();
		});

		this.scope.register([], '2', () => {
			snooze15Button.click();
		});

		this.scope.register([], '3', () => {
			snooze60Button.click();
		});
	}

	private showCustomSnoozeDialog() {
		const dialog = this.contentEl.createDiv('custom-snooze-dialog');
		dialog.innerHTML = `
			<h3>تأجيل مخصص</h3>
			<input type="number" id="snooze-minutes" placeholder="عدد الدقائق" min="1" max="1440">
			<div class="dialog-buttons">
				<button id="confirm-snooze">تأجيل</button>
				<button id="cancel-snooze">إلغاء</button>
			</div>
		`;

		const minutesInput = dialog.querySelector('#snooze-minutes') as HTMLInputElement;
		const confirmButton = dialog.querySelector('#confirm-snooze') as HTMLButtonElement;
		const cancelButton = dialog.querySelector('#cancel-snooze') as HTMLButtonElement;

		confirmButton.onclick = async () => {
			const minutes = parseInt(minutesInput.value);
			if (minutes && minutes > 0) {
				await this.plugin.snoozeReminder(this.reminder, minutes);
				this.close();
			}
		};

		cancelButton.onclick = () => {
			dialog.remove();
		};

		minutesInput.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}