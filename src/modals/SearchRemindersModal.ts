import { App, Modal, Notice } from 'obsidian';
import ReminderPlugin from '../main';

export class SearchRemindersModal extends Modal {
	plugin: ReminderPlugin;

	constructor(app: App, plugin: ReminderPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'البحث في التذكيرات' });

		// حقل البحث
		const searchContainer = contentEl.createDiv('search-container');
		const searchInput = searchContainer.createEl('input', {
			type: 'text',
			placeholder: 'ابحث في العناوين، الروابط، الفئات...'
		});
		searchInput.addClass('search-input');

		// فلاتر البحث
		const filtersContainer = contentEl.createDiv('search-filters');
		
		const stats = this.plugin.getReminderStats();
		
		// فلتر الحالة
		const statusFilter = filtersContainer.createEl('select');
		statusFilter.createEl('option', { value: '', text: 'جميع الحالات' });
		statusFilter.createEl('option', { value: 'active', text: 'نشط' });
		statusFilter.createEl('option', { value: 'completed', text: 'مكتمل' });

		// فلتر الأهمية
		const importanceFilter = filtersContainer.createEl('select');
		importanceFilter.createEl('option', { value: '', text: 'جميع الأهميات' });
		importanceFilter.createEl('option', { value: 'day', text: 'يومي' });
		importanceFilter.createEl('option', { value: 'week', text: 'أسبوعي' });
		importanceFilter.createEl('option', { value: 'month', text: 'شهري' });

		// فلتر الفئة
		if (stats.categories.length > 0) {
			const categoryFilter = filtersContainer.createEl('select');
			categoryFilter.createEl('option', { value: '', text: 'جميع الفئات' });
			stats.categories.forEach(category => {
				categoryFilter.createEl('option', { value: category, text: category });
			});
		}

		// نتائج البحث
		const resultsContainer = contentEl.createDiv('search-results');

		// دالة البحث
		const performSearch = () => {
			const query = searchInput.value.trim();
			const statusValue = statusFilter.value;
			const importanceValue = importanceFilter.value;
			const categoryValue = filtersContainer.querySelector('select:last-child')?.value || '';

			let results = this.plugin.getAllReminders();

			// تطبيق البحث النصي
			if (query) {
				results = this.plugin.searchReminders(query);
			}

			// تطبيق فلاتر الحالة
			if (statusValue === 'active') {
				results = results.filter(r => r.isActive);
			} else if (statusValue === 'completed') {
				results = results.filter(r => !r.isActive);
			}

			// تطبيق فلاتر الأهمية
			if (importanceValue) {
				results = results.filter(r => r.importance === importanceValue);
			}

			// تطبيق فلاتر الفئة
			if (categoryValue) {
				results = results.filter(r => r.category === categoryValue);
			}

			this.displayResults(results, resultsContainer);
		};

		// مستمعي الأحداث
		searchInput.addEventListener('input', performSearch);
		statusFilter.addEventListener('change', performSearch);
		importanceFilter.addEventListener('change', performSearch);
		if (filtersContainer.querySelector('select:last-child')) {
			filtersContainer.querySelector('select:last-child')?.addEventListener('change', performSearch);
		}

		// البحث الأولي
		performSearch();

		// التركيز على حقل البحث
		searchInput.focus();
	}

	private displayResults(results: any[], container: HTMLElement) {
		container.empty();

		if (results.length === 0) {
			container.createEl('p', { text: 'لا توجد نتائج مطابقة للبحث' });
			return;
		}

		container.createEl('h3', { text: `النتائج (${results.length})` });

		const resultsList = container.createDiv('results-list');

		results.forEach(reminder => {
			const resultItem = resultsList.createDiv('result-item');
			
			const resultInfo = resultItem.createDiv('result-info');
			resultInfo.createEl('h4', { text: reminder.title });
			resultInfo.createEl('p', { text: `الرابط: ${reminder.url}` });
			resultInfo.createEl('p', { text: `الوقت: ${new Date(reminder.reminderTime).toLocaleString('ar')}` });
			resultInfo.createEl('p', { text: `الحالة: ${reminder.isActive ? 'نشط' : 'مكتمل'}` });
			
			if (reminder.category) {
				resultInfo.createEl('p', { text: `الفئة: ${reminder.category}` });
			}
			
			if (reminder.importance) {
				resultInfo.createEl('p', { text: `الأهمية: ${this.plugin.getImportanceArabic(reminder.importance)}` });
			}

			const resultActions = resultItem.createDiv('result-actions');
			
			const openButton = resultActions.createEl('button', { text: 'فتح الرابط' });
			openButton.onclick = () => {
				window.open(reminder.url, '_blank');
			};

			if (reminder.isActive) {
				const snoozeButton = resultActions.createEl('button', { text: 'تأجيل' });
				snoozeButton.onclick = async () => {
					await this.plugin.snoozeReminder(reminder, 5);
					new Notice('تم تأجيل التذكير');
					this.onOpen(); // إعادة تحديث النتائج
				};

				const cancelButton = resultActions.createEl('button', { text: 'إلغاء' });
				cancelButton.addClass('mod-warning');
				cancelButton.onclick = async () => {
					await this.plugin.cancelReminder(reminder.id);
					new Notice('تم إلغاء التذكير');
					this.onOpen(); // إعادة تحديث النتائج
				};
			}
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}