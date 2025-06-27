import { App, Modal } from 'obsidian';
import ReminderPlugin from '../main';

export class ReminderStatsModal extends Modal {
	plugin: ReminderPlugin;

	constructor(app: App, plugin: ReminderPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'إحصائيات التذكيرات' });

		const stats = this.plugin.getReminderStats();

		// الإحصائيات العامة
		const generalStats = contentEl.createDiv('stats-section');
		generalStats.createEl('h3', { text: 'الإحصائيات العامة' });
		
		const generalGrid = generalStats.createDiv('stats-grid');
		this.createStatCard(generalGrid, 'إجمالي التذكيرات', stats.total.toString(), '📊');
		this.createStatCard(generalGrid, 'التذكيرات النشطة', stats.active.toString(), '🔔');
		this.createStatCard(generalGrid, 'التذكيرات المكتملة', stats.completed.toString(), '✅');
		
		const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
		this.createStatCard(generalGrid, 'معدل الإنجاز', `${completionRate}%`, '📈');

		// إحصائيات الأهمية
		const importanceStats = contentEl.createDiv('stats-section');
		importanceStats.createEl('h3', { text: 'توزيع الأهمية' });
		
		const importanceGrid = importanceStats.createDiv('stats-grid');
		this.createStatCard(importanceGrid, 'يومي', stats.importanceStats.day.toString(), '🟢');
		this.createStatCard(importanceGrid, 'أسبوعي', stats.importanceStats.week.toString(), '🟡');
		this.createStatCard(importanceGrid, 'شهري', stats.importanceStats.month.toString(), '🔴');

		// الفئات والمجالات
		if (stats.categories.length > 0) {
			const categoriesSection = contentEl.createDiv('stats-section');
			categoriesSection.createEl('h3', { text: 'الفئات' });
			const categoriesList = categoriesSection.createDiv('stats-list');
			stats.categories.forEach(category => {
				const count = this.plugin.getAllReminders().filter(r => r.category === category).length;
				categoriesList.createEl('div', { text: `${category}: ${count}` });
			});
		}

		if (stats.domains.length > 0) {
			const domainsSection = contentEl.createDiv('stats-section');
			domainsSection.createEl('h3', { text: 'المجالات' });
			const domainsList = domainsSection.createDiv('stats-list');
			stats.domains.forEach(domain => {
				const count = this.plugin.getAllReminders().filter(r => r.domain === domain).length;
				domainsList.createEl('div', { text: `${domain}: ${count}` });
			});
		}

		if (stats.complexities.length > 0) {
			const complexitiesSection = contentEl.createDiv('stats-section');
			complexitiesSection.createEl('h3', { text: 'مستويات التعقيد' });
			const complexitiesList = complexitiesSection.createDiv('stats-list');
			stats.complexities.forEach(complexity => {
				const count = this.plugin.getAllReminders().filter(r => r.complexity === complexity).length;
				complexitiesList.createEl('div', { text: `${complexity}: ${count}` });
			});
		}

		// معلومات المزامنة
		const syncSection = contentEl.createDiv('stats-section');
		syncSection.createEl('h3', { text: 'حالة المزامنة' });
		
		const syncGrid = syncSection.createDiv('stats-grid');
		const statusIcon = stats.isOnline ? '🟢' : '🔴';
		const statusText = stats.isOnline ? 'متصل' : 'غير متصل';
		this.createStatCard(syncGrid, 'حالة الاتصال', statusText, statusIcon);
		
		const lastSyncText = stats.lastSyncTime ? 
			stats.lastSyncTime.toLocaleString('ar') : 'لم يتم المزامنة بعد';
		this.createStatCard(syncGrid, 'آخر مزامنة', lastSyncText, '🔄');

		// أزرار العمل
		const actionsSection = contentEl.createDiv('stats-actions');
		
		const refreshButton = actionsSection.createEl('button', { text: 'تحديث الإحصائيات' });
		refreshButton.onclick = () => this.onOpen();
		
		const syncButton = actionsSection.createEl('button', { text: 'مزامنة الآن' });
		syncButton.addClass('mod-cta');
		syncButton.onclick = async () => {
			await this.plugin.syncRemindersWithApi();
			this.onOpen();
		};

		const exportButton = actionsSection.createEl('button', { text: 'تصدير البيانات' });
		exportButton.onclick = () => this.exportData();
	}

	private createStatCard(container: HTMLElement, title: string, value: string, icon: string) {
		const card = container.createDiv('stat-card');
		card.createEl('div', { text: icon, cls: 'stat-icon' });
		card.createEl('div', { text: value, cls: 'stat-value' });
		card.createEl('div', { text: title, cls: 'stat-title' });
	}

	private exportData() {
		const data = {
			reminders: this.plugin.getAllReminders(),
			stats: this.plugin.getReminderStats(),
			exportDate: new Date().toISOString()
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `reminders-export-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}