import { App, PluginSettingTab, Setting, Notice } from 'obsidian';
import ReminderPlugin from '../main';

export class ReminderSettingTab extends PluginSettingTab {
	plugin: ReminderPlugin;

	constructor(app: App, plugin: ReminderPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'إعدادات التذكيرات' });

		// إعدادات API
		containerEl.createEl('h3', { text: 'إعدادات API' });

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
			.setName('عدد المحاولات القصوى')
			.setDesc('عدد المحاولات عند فشل الاتصال بـ API')
			.addSlider(slider => slider
				.setLimits(1, 5, 1)
				.setValue(this.plugin.settings.maxRetries)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxRetries = value;
					await this.plugin.saveSettings();
				}));

		// إعدادات المزامنة
		containerEl.createEl('h3', { text: 'إعدادات المزامنة' });

		new Setting(containerEl)
			.setName('تفعيل المزامنة التلقائية')
			.setDesc('مزامنة التذكيرات مع الخادم تلقائياً')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableAutoSync)
				.onChange(async (value) => {
					this.plugin.settings.enableAutoSync = value;
					await this.plugin.saveSettings();
					
					if (value) {
						this.plugin.startAutoSync();
					} else {
						this.plugin.stopAutoSync();
					}
				}));

		new Setting(containerEl)
			.setName('فترة المزامنة (بالدقائق)')
			.setDesc('كم دقيقة بين كل مزامنة تلقائية')
			.addSlider(slider => slider
				.setLimits(5, 120, 5)
				.setValue(this.plugin.settings.syncIntervalMinutes)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.syncIntervalMinutes = value;
					await this.plugin.saveSettings();
					
					// إعادة تشغيل المزامنة التلقائية بالفترة الجديدة
					if (this.plugin.settings.enableAutoSync) {
						this.plugin.stopAutoSync();
						this.plugin.startAutoSync();
					}
				}));

		// إعدادات الإشعارات
		containerEl.createEl('h3', { text: 'إعدادات الإشعارات' });

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
			.setName('تفعيل الأصوات')
			.setDesc('تشغيل صوت عند ظهور التذكيرات')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSoundNotifications)
				.onChange(async (value) => {
					this.plugin.settings.enableSoundNotifications = value;
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

		// إعدادات التوطين
		containerEl.createEl('h3', { text: 'إعدادات التوطين' });

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

		// قسم الإحصائيات والأدوات
		containerEl.createEl('h3', { text: 'الإحصائيات والأدوات' });
		
		const stats = this.plugin.getReminderStats();
		
		const statsContainer = containerEl.createDiv('reminder-stats');
		statsContainer.createEl('p', { text: `التذكيرات النشطة: ${stats.active}` });
		statsContainer.createEl('p', { text: `إجمالي التذكيرات: ${stats.total}` });
		statsContainer.createEl('p', { text: `معدل الإنجاز: ${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%` });
		
		const statusText = stats.isOnline ? 'متصل' : 'غير متصل';
		const statusIcon = stats.isOnline ? '🟢' : '🔴';
		statsContainer.createEl('p', { text: `حالة الاتصال: ${statusIcon} ${statusText}` });
		
		if (stats.lastSyncTime) {
			statsContainer.createEl('p', { text: `آخر مزامنة: ${stats.lastSyncTime.toLocaleString('ar')}` });
		}

		// أزرار الأدوات
		new Setting(containerEl)
			.setName('اختبار الاتصال')
			.setDesc('اختبار الاتصال مع API')
			.addButton(button => button
				.setButtonText('اختبار الآن')
				.onClick(async () => {
					const loadingNotice = new Notice('جاري اختبار الاتصال...', 0);
					try {
						await this.plugin.checkConnectivity();
						loadingNotice.hide();
						new Notice(this.plugin.syncStatus.isOnline ? 'الاتصال ناجح!' : 'فشل في الاتصال');
					} catch (error) {
						loadingNotice.hide();
						new Notice('فشل في الاتصال');
					}
					this.display(); // إعادة تحديث الصفحة
				}));

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

		new Setting(containerEl)
			.setName('تصدير البيانات')
			.setDesc('تصدير جميع التذكيرات إلى ملف JSON')
			.addButton(button => button
				.setButtonText('تصدير')
				.onClick(() => {
					this.exportData();
				}));

		new Setting(containerEl)
			.setName('استيراد البيانات')
			.setDesc('استيراد التذكيرات من ملف JSON')
			.addButton(button => button
				.setButtonText('استيراد')
				.onClick(() => {
					this.importData();
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

	private exportData() {
		const data = {
			reminders: this.plugin.getAllReminders(),
			settings: this.plugin.settings,
			exportDate: new Date().toISOString(),
			version: '1.0.0'
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `obsidian-reminders-backup-${new Date().toISOString().split('T')[0]}.json`;
		a.click();
		URL.revokeObjectURL(url);
		
		new Notice('تم تصدير البيانات بنجاح');
	}

	private importData() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.json';
		
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				const data = JSON.parse(text);
				
				if (data.reminders && Array.isArray(data.reminders)) {
					// دمج التذكيرات المستوردة مع الموجودة
					const importedReminders = data.reminders.map((reminder: any) => ({
						...reminder,
						id: this.plugin.generateId(), // إنشاء معرف جديد
						reminderTime: new Date(reminder.reminderTime),
						createdAt: reminder.createdAt ? new Date(reminder.createdAt) : new Date(),
						lastSynced: null // سيتم المزامنة لاحقاً
					}));
					
					this.plugin.reminderStorage.push(...importedReminders);
					await this.plugin.saveReminders();
					this.plugin.restoreActiveReminders();
					
					new Notice(`تم استيراد ${importedReminders.length} تذكير بنجاح`);
					this.display();
				} else {
					new Notice('ملف غير صحيح - لا يحتوي على تذكيرات');
				}
			} catch (error) {
				new Notice('خطأ في قراءة الملف');
			}
		};
		
		input.click();
	}
}