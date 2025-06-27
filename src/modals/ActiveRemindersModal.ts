import { App, Modal, Notice } from 'obsidian';
import ReminderPlugin from '../main';

export class ActiveRemindersModal extends Modal {
	plugin: ReminderPlugin;

	constructor(app: App, plugin: ReminderPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'التذكيرات النشطة' });

		// إضافة فلاتر
		this.addFilters(contentEl);

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

		// ترتيب التذكيرات حسب الوقت
		const sortedReminders = activeReminders.sort((a, b) => 
			new Date(a.reminderTime).getTime() - new Date(b.reminderTime).getTime()
		);

		sortedReminders.forEach(reminder => {
			const reminderItem = remindersList.createDiv('reminder-item');
			
			const reminderInfo = reminderItem.createDiv('reminder-info');
			reminderInfo.createEl('h3', { text: reminder.title });
			reminderInfo.createEl('p', { text: `الرابط: ${reminder.url}` });
			
			const timeText = this.getTimeText(reminder.reminderTime);
			reminderInfo.createEl('p', { text: `الوقت: ${timeText}` });
			
			if (reminder.importance) {
				reminderInfo.createEl('p', { text: `الأهمية: ${this.plugin.getImportanceArabic(reminder.importance)}` });
			}
			
			if (reminder.category) {
				reminderInfo.createEl('p', { text: `الفئة: ${reminder.category}` });
			}

			if (reminder.complexity) {
				reminderInfo.createEl('p', { text: `التعقيد: ${reminder.complexity}` });
			}

			if (reminder.domain) {
				reminderInfo.createEl('p', { text: `المجال: ${reminder.domain}` });
			}

			// إضافة صورة المعاينة إذا كانت متوفرة
			if (reminder.imageUrl) {
				const img = reminderInfo.createEl('img', {
					attr: { src: reminder.imageUrl, alt: 'صورة المعاينة' }
				});
				img.style.maxWidth = '200px';
				img.style.maxHeight = '150px';
				img.style.borderRadius = '4px';
			}

			const reminderActions = reminderItem.createDiv('reminder-actions');
			
			const openButton = reminderActions.createEl('button', { text: 'فتح الرابط' });
			openButton.onclick = () => {
				window.open(reminder.url, '_blank');
			};

			const snooze5Button = reminderActions.createEl('button', { text: 'تأجيل 5 دقائق' });
			snooze5Button.onclick = async () => {
				await this.plugin.snoozeReminder(reminder, 5);
				this.onOpen(); // إعادة تحديث القائمة
			};

			const snooze15Button = reminderActions.createEl('button', { text: 'تأجيل 15 دقيقة' });
			snooze15Button.onclick = async () => {
				await this.plugin.snoozeReminder(reminder, 15);
				this.onOpen(); // إعادة تحديث القائمة
			};

			const snooze60Button = reminderActions.createEl('button', { text: 'تأجيل ساعة' });
			snooze60Button.onclick = async () => {
				await this.plugin.snoozeReminder(reminder, 60);
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

	private addFilters(contentEl: HTMLElement) {
		const filtersContainer = contentEl.createDiv('reminder-filters');
		
		// فلتر حسب الأهمية
		const importanceFilter = filtersContainer.createEl('select');
		importanceFilter.createEl('option', { value: '', text: 'جميع الأهميات' });
		importanceFilter.createEl('option', { value: 'day', text: 'يومي' });
		importanceFilter.createEl('option', { value: 'week', text: 'أسبوعي' });
		importanceFilter.createEl('option', { value: 'month', text: 'شهري' });

		// فلتر حسب الفئة
		const stats = this.plugin.getReminderStats();
		if (stats.categories.length > 0) {
			const categoryFilter = filtersContainer.createEl('select');
			categoryFilter.createEl('option', { value: '', text: 'جميع الفئات' });
			stats.categories.forEach(category => {
				categoryFilter.createEl('option', { value: category, text: category });
			});
		}
	}

	private getTimeText(reminderTime: Date): string {
		const now = new Date();
		const timeDiff = reminderTime.getTime() - now.getTime();
		
		if (timeDiff < 0) {
			return `متأخر بـ ${this.formatTimeDiff(-timeDiff)}`;
		} else if (timeDiff < 60 * 60 * 1000) { // أقل من ساعة
			const minutes = Math.floor(timeDiff / (60 * 1000));
			return `خلال ${minutes} دقيقة`;
		} else if (timeDiff < 24 * 60 * 60 * 1000) { // أقل من يوم
			const hours = Math.floor(timeDiff / (60 * 60 * 1000));
			return `خلال ${hours} ساعة`;
		} else {
			return reminderTime.toLocaleString('ar');
		}
	}

	private formatTimeDiff(timeDiff: number): string {
		const minutes = Math.floor(timeDiff / (60 * 1000));
		const hours = Math.floor(minutes / 60);
		const days = Math.floor(hours / 24);

		if (days > 0) {
			return `${days} يوم`;
		} else if (hours > 0) {
			return `${hours} ساعة`;
		} else {
			return `${minutes} دقيقة`;
		}
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}