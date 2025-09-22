window.addEventListener('load', () => {
    try {
        // --- Timezone Helper ---
        const getTehranMoment = (date, format) => moment.tz(date, format, "Asia/Tehran");

        // --- Element & State Initialization ---
        const $ = id => document.getElementById(id);
        const appView = $('app-view');
        const settingsView = $('settings-view');
        const confirmModal = $('confirm-modal');
        let overtimeData = JSON.parse(localStorage.getItem('overtime_data_v12')) || [];
        let userSettings = JSON.parse(localStorage.getItem('overtime_settings_v12')) || null;
        let confirmCallback = null;
        const shiftTypeMap = { 'morning': 'شیفت صبح', 'evening': 'شیفت عصر', 'night': 'شیفت شب', 'rest': 'استراحت', 'holiday': 'روز تعطیل', 'change_shift': 'چنج شیفت' };

        const shiftPatterns = {
            four_shift: { cycleLength: 12, types: [{t: 'evening', d: 3}, {t: 'morning', d: 3}, {t: 'night', d: 3}, {t: 'rest', d: 3}] },
            five_shift: { cycleLength: 10, types: [{t: 'evening', d: 2}, {t: 'morning', d: 2}, {t: 'night', d: 2}, {t: 'rest', d: 4}] }
        };

        // --- Shift Calculation Logic ---
        const calculateShiftForDate = (targetDateStr) => {
            if (!userSettings || !userSettings.shiftPattern) return null;
            
            const pattern = userSettings.shiftPattern;
            const targetDate = getTehranMoment(targetDateStr, 'jYYYY/jMM/DD').startOf('day');

            if (pattern === 'day_worker' || pattern === 'two_shift') {
                const jDayOfWeek = targetDate.jDay(); // Saturday: 0, ..., Friday: 6
                const isWeekend = (jDayOfWeek === 5 || jDayOfWeek === 6);
                if (isWeekend) return { type: 'rest', label: 'آخر هفته' };
                if (pattern === 'day_worker') return { type: 'morning', label: 'روزکار' };
                
                if(!userSettings.referenceDate) return null;
                const refDate = getTehranMoment(userSettings.referenceDate, 'jYYYY/jMM/DD').startOf('day');
                const weekDiff = targetDate.diff(refDate, 'weeks');
                const refIsMorning = userSettings.referenceShiftType === 'morning';
                return (weekDiff % 2 === 0) ? 
                       (refIsMorning ? { type: 'morning', label: 'هفته صبح' } : { type: 'evening', label: 'هفته عصر' }) :
                       (refIsMorning ? { type: 'evening', label: 'هفته عصر' } : { type: 'morning', label: 'هفته صبح' });
            }
            
            if (!userSettings.referenceDate || !shiftPatterns[pattern]) return null;
            
            const refDate = getTehranMoment(userSettings.referenceDate, 'jYYYY/jMM/DD').startOf('day');
            const dayDiff = targetDate.diff(refDate, 'days');
            
            const patternData = shiftPatterns[pattern];
            let refDayIndex = 0;
            let daysAccumulator = 0;
            for(const shift of patternData.types) {
                if(shift.t === userSettings.referenceShiftType) {
                    refDayIndex = daysAccumulator + (userSettings.referenceShiftDay - 1);
                    break;
                }
                daysAccumulator += shift.d;
            }

            const targetDayIndex = (refDayIndex + dayDiff % patternData.cycleLength + patternData.cycleLength) % patternData.cycleLength;
            
            daysAccumulator = 0;
            for(const shift of patternData.types) {
                if (targetDayIndex < daysAccumulator + shift.d) {
                    const dayInShift = targetDayIndex - daysAccumulator + 1;
                    const labelMap = {'evening': 'عصر', 'morning': 'صبح', 'night': 'شب', 'rest': 'استراحت'};
                    return { type: shift.t, label: `روز ${dayInShift} از شیفت ${labelMap[shift.t]}` };
                }
                daysAccumulator += shift.d;
            }
            
            return null;
        };

        // --- Core Functions ---
        const saveData = () => localStorage.setItem('overtime_data_v12', JSON.stringify(overtimeData));
        const saveSettings = () => localStorage.setItem('overtime_settings_v12', JSON.stringify(userSettings));
        const calculateDuration = (s, e) => (parseFloat(e) > parseFloat(s)) ? (e - s) : (24 - s + parseFloat(e));
        const showError = (msg) => { $('error-message').textContent = msg; $('error-message').classList.remove('hidden'); setTimeout(() => $('error-message').classList.add('hidden'), 5000); };
        
        const showModal = (title, body, confirmText = 'باشه', confirmClass = 'bg-blue-600') => {
            showConfirmModal(title, body, confirmText, hideConfirmModal, confirmClass);
        };
        
        const showConfirmModal = (title, body, confirmText, onConfirm, confirmClass = 'bg-red-600 hover:bg-red-700') => {
            $('modal-title').textContent = title;
            $('modal-body').textContent = body;
            const confirmBtn = $('modal-confirm-btn');
            confirmBtn.textContent = confirmText;
            confirmBtn.className = `w-full sm:w-auto px-4 py-2 text-white rounded-lg ${confirmClass}`;
            confirmCallback = onConfirm;
            $('confirm-modal').classList.remove('hidden');
            setTimeout(() => $('confirm-modal').classList.remove('opacity-0'), 10);
        };
        const hideConfirmModal = () => {
            $('confirm-modal').classList.add('opacity-0');
            setTimeout(() => { $('confirm-modal').classList.add('hidden'); confirmCallback = null; }, 300);
        };
        
        // --- Excel Functions ---
        const exportToExcel = () => {
            if (overtimeData.length === 0) return showError("هیچ داده‌ای برای خروجی گرفتن وجود ندارد.");
            const dataToExport = overtimeData.map(rec => ({
                'تاریخ': rec.date, 'نوع شیفت': shiftTypeMap[rec.shiftType] || '', 'جانشین': rec.successor || '',
                'ساعت شروع': rec.startTime, 'ساعت پایان': rec.endTime, 'توضیحات': rec.description || ''
            }));
            const worksheet = XLSX.utils.json_to_sheet(dataToExport);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Sabegh-e Ezafekari");
            XLSX.writeFile(workbook, "Ezafekari.xlsx");
        };

        const importFromExcel = (event) => {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const importedJson = XLSX.utils.sheet_to_json(worksheet, {raw: false});
                    if(importedJson.length === 0) return showError("فایل اکسل خالی است.");
                    
                    const shiftTypeMapReverse = Object.fromEntries(Object.entries(shiftTypeMap).map(([k, v]) => [v, k]));
                    const currentDataMap = overtimeData.reduce((map, item) => (map[item.date] = item, map), {});
                    let importedCount = 0;
                    
                    importedJson.forEach(row => {
                        let dateStr = String(row['تاریخ'] || '').trim();
                        if (typeof row['تاریخ'] === 'number') {
                            dateStr = moment(new Date(1900, 0, row['تاریخ'] - 1)).locale('fa').format('YYYY/MM/DD');
                        }

                        if(moment(dateStr, 'jYYYY/jMM/DD', true).isValid()) {
                            currentDataMap[dateStr] = {
                                date: dateStr, shiftType: shiftTypeMapReverse[row['نوع شیفت']] || 'holiday',
                                successor: String(row['جانشین'] || '').trim(), 
                                startTime: String(row['ساعت شروع'] || '1').split(':')[0],
                                endTime: String(row['ساعت پایان'] || '1').split(':')[0], 
                                description: String(row['توضیحات'] || '').trim(),
                            };
                            importedCount++;
                        }
                    });

                    if(importedCount > 0) {
                       overtimeData = Object.values(currentDataMap);
                       saveData();
                       renderRecords();
                       showModal('موفق', `${importedCount} رکورد وارد شد.`);
                    } else { showError("هیچ رکورد معتبری یافت نشد."); }
                } catch (err) { showError("خطا در پردازش فایل اکسل."); console.error(err); } 
                finally { $('import-file').value = ''; }
            };
            reader.readAsArrayBuffer(file);
        };
        
        // --- UI & Render Functions ---
        const renderRecords = () => {
            const recordsBody = $('overtime-records');
            recordsBody.innerHTML = '';
            $('no-records').style.display = overtimeData.length === 0 ? 'block' : 'none';
            
            const sortedData = [...overtimeData].sort((a, b) => moment(b.date, 'jYYYY/jMM/DD').diff(moment(a.date, 'jYYYY/jMM/DD')));
            sortedData.forEach(rec => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="p-4 text-sm">${rec.date}</td>
                    <td class="p-4 text-sm">${shiftTypeMap[rec.shiftType] || ''}</td>
                    <td class="p-4 text-sm hidden md:table-cell">${rec.successor || '-'}</td>
                    <td class="p-4 text-sm hidden md:table-cell">${rec.description || '-'}</td>
                    <td class="p-4 text-sm">${rec.startTime}:00</td>
                    <td class="p-4 text-sm">${rec.endTime}:00</td>
                    <td class="p-4 text-sm font-medium">${calculateDuration(rec.startTime, rec.endTime)} ساعت</td>
                    <td class="p-4 text-sm"><button data-date="${rec.date}" class="delete-btn text-red-500 hover:underline">حذف</button></td>
                `;
                recordsBody.appendChild(tr);
            });
            updateTotalHours();
        };

        const updateTotalHours = () => {
            const totalHours = overtimeData.reduce((t, r) => t + calculateDuration(r.startTime, r.endTime), 0);
            let bonusHours = 0;
            if (userSettings && (userSettings.shiftPattern === 'four_shift' || userSettings.shiftPattern === 'five_shift' || userSettings.complex === 'shemsh')) {
                const workingDays = overtimeData.filter(r => ['morning', 'evening', 'night'].includes(r.shiftType)).length;
                if (workingDays > 0) {
                    bonusHours = 5;
                }
            }
            $('total-hours-display').textContent = `مجموع اضافه کاری: ${totalHours} ساعت`;
            $('overtime-bonus-display').textContent = `اورتایم شیفت: ${bonusHours} ساعت`;
            $('grand-total-display').textContent = `جمع کل: ${totalHours + bonusHours} ساعت`;
        };
        
        const updateShiftForDate = (dateStr) => {
            if (!dateStr) {
                $('auto-shift-display').textContent = '';
                return;
            }
             const autoShift = calculateShiftForDate(dateStr);
            if (autoShift) {
                $('auto-shift-display').textContent = autoShift.label;
                $('shift-type').value = autoShift.type;
            } else {
                $('auto-shift-display').textContent = '';
            }
        };

        const updateSettingsUI = () => {
            const complex = $('complex-select').value;
            const pattern = $('shift-pattern').value;
            const calibrationWrapper = $('calibration-wrapper');
            const refShiftTypeSelect = $('reference-shift-type');
            const refShiftDayWrapper = $('reference-shift-day').parentElement;
            const refDateHelp = $('reference-date-help');
            
            $('five-shift-option').style.display = (complex === 'shemsh') ? 'block' : 'none';
            if (complex === 'alumina' && pattern === 'five_shift') {
                $('shift-pattern').value = 'four_shift'; 
            }

            if (pattern === 'day_worker') {
                calibrationWrapper.classList.add('hidden');
            } else {
                calibrationWrapper.classList.remove('hidden');
                if (pattern === 'two_shift') {
                    refShiftTypeSelect.innerHTML = '<option value="morning">هفته صبح</option><option value="evening">هفته عصر</option>';
                    refShiftDayWrapper.classList.add('hidden');
                    refDateHelp.textContent = 'تاریخ یک روز از هفته‌ای که وضعیت آن را می‌دانید وارد کنید (مثلا شنبه).';
                } else {
                    refShiftTypeSelect.innerHTML = '<option value="evening">عصر</option><option value="morning">صبح</option><option value="night">شب</option><option value="rest">استراحت</option>';
                    refShiftDayWrapper.classList.remove('hidden');
                    refDateHelp.textContent = 'یک روز دلخواه که وضعیت شیفت آن را به طور دقیق می‌دانید (مثلاً ۲۱ام ماه).';
                }
            }
        };

        const populateTimeOptions = () => {
            const startTimeSelect = $('start-time');
            const endTimeSelect = $('end-time');
            if (startTimeSelect.options.length > 0) return;

            for (let i = 1; i <= 24; i++) {
                startTimeSelect.add(new Option(`${i}:00`, i));
                endTimeSelect.add(new Option(`${i}:00`, i));
            }
        };

        const validateOvertime = (shiftType, startTime, endTime) => {
            const nonValidationShifts = ['rest', 'holiday', 'change_shift'];
            if (nonValidationShifts.includes(shiftType)) return true;

            const getRanges = (start, end) => {
                const s = parseFloat(start);
                const e = parseFloat(end);
                if (s < e) return [[s, e]];
                return [[s, 24.5], [0, e]]; 
            };

            const rangesOverlap = (ranges1, ranges2) => {
                for (const r1 of ranges1) {
                    for (const r2 of ranges2) {
                        if (Math.max(r1[0], r2[0]) < Math.min(r1[1], r2[1])) {
                            return true;
                        }
                    }
                }
                return false;
            };

            const ot_ranges = getRanges(startTime, endTime);
            let work_ranges;
            let error_msg;
            
            const isShemshDayWorker = userSettings.complex === 'shemsh' && (userSettings.shiftPattern === 'day_worker' || userSettings.shiftPattern === 'two_shift');

            if (isShemshDayWorker && (shiftType === 'morning' || shiftType === 'evening')) {
                 work_ranges = [[7, 15]];
                 error_msg = 'اضافه کاری نمی‌تواند با ساعت کاری مجموعه شمش (۷ الی ۱۵) تداخل داشته باشد.';
            } else {
                switch (shiftType) {
                    case 'morning':
                        work_ranges = [[7, 16]];
                        error_msg = 'اضافه کاری نمی‌تواند با ساعت کاری شیفت صبح (۷ الی ۱۶) تداخل داشته باشد.';
                        break;
                    case 'evening':
                        work_ranges = [[15, 23.5]];
                        error_msg = 'اضافه کاری نمی‌تواند با ساعت کاری شیفت عصر (۱۵ الی ۲۳:۳۰) تداخل داشته باشد.';
                        break;
                    case 'night':
                        work_ranges = [[23, 24.5], [0, 7.5]];
                        error_msg = 'اضافه کاری نمی‌تواند با ساعت کاری شیفت شب (۲۳ الی ۷:۳۰) تداخل داشته باشد.';
                        break;
                    default: return true;
                }
            }

            if (rangesOverlap(ot_ranges, work_ranges)) {
                showModal('خطای ثبت', error_msg);
                return false;
            }
            return true;
        };


        // --- App Initialization and Event Listeners ---
        const setupEventListeners = (view) => {
            if (view === 'app') {
                $('overtime-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const date = $('date-input').value;
                    if (!date) return showError('لطفاً یک تاریخ انتخاب کنید.');
                    
                    const startTime = $('start-time').value;
                    const endTime = $('end-time').value;
                    const shiftType = $('shift-type').value;

                    if (!validateOvertime(shiftType, startTime, endTime)) {
                        return;
                    }
                    
                    const record = { date, startTime, endTime, shiftType, successor: $('successor-input').value.trim(), description: $('description').value.trim() };
                    const index = overtimeData.findIndex(r => r.date === date);
                    if (index > -1) overtimeData[index] = record; else overtimeData.push(record);
                    saveData();
                    renderRecords();
                    $('overtime-form').reset();
                    $('date-input').value = '';
                    updateShiftForDate(null);
                });
                $('delete-all-btn').addEventListener('click', () => {
                    if (overtimeData.length === 0) return;
                    showConfirmModal('حذف همه', 'آیا از حذف تمام سوابق مطمئن هستید؟', 'بله، حذف کن', () => {
                        overtimeData = [];
                        saveData();
                        renderRecords();
                        hideConfirmModal();
                    });
                });
                $('import-btn').addEventListener('click', () => $('import-file').click());
                $('import-file').addEventListener('change', importFromExcel);
                $('export-btn').addEventListener('click', exportToExcel);
                $('overtime-records').addEventListener('click', (e) => {
                    if (e.target.classList.contains('delete-btn')) {
                        const date = e.target.dataset.date;
                        showConfirmModal('حذف رکورد', `آیا رکورد تاریخ ${date} حذف شود؟`, 'بله، حذف کن', () => {
                            overtimeData = overtimeData.filter(r => r.date !== date);
                            saveData();
                            renderRecords();
                            hideConfirmModal();
                        });
                    }
                });
                $('change-settings-btn').addEventListener('click', showSettingsView);
            } else { // settings view
                $('complex-select').addEventListener('change', updateSettingsUI);
                $('shift-pattern').addEventListener('change', updateSettingsUI);
                $('settings-form').addEventListener('submit', (e) => {
                    e.preventDefault();
                    const pattern = $('shift-pattern').value;
                    if (pattern !== 'day_worker' && !$('reference-date').value) {
                         return alert('لطفاً تاریخ مرجع را انتخاب کنید.');
                    }
                    userSettings = {
                        complex: $('complex-select').value,
                        shiftPattern: pattern,
                        referenceDate: $('reference-date').value,
                        referenceShiftType: $('reference-shift-type').value,
                        referenceShiftDay: parseInt($('reference-shift-day').value) || 1,
                    };
                    saveSettings();
                    initializeApp();
                });
            }
        };
        
        const initializeApp = () => {
            appView.classList.remove('hidden-view');
            settingsView.classList.add('hidden-view');
            
            populateTimeOptions();
            
            kamaDatepicker('date-input', {
                twodigit: true, closeAfterSelect: true, gotoToday: true,
                onselect: (key) => {
                    const selectedDate = getTehranMoment(key * 1000).locale('fa').format('YYYY/MM/DD');
                    updateShiftForDate(selectedDate);
                }
            });
            
            const todayJalali = getTehranMoment().locale('fa').format('YYYY/MM/DD');
            $('date-input').value = todayJalali;
            updateShiftForDate(todayJalali);

            setupEventListeners('app');
            renderRecords();
        };

        const showSettingsView = () => {
            settingsView.classList.remove('hidden-view');
            appView.classList.add('hidden-view');
            kamaDatepicker('reference-date', { twodigit: true, closeAfterSelect: true, gotoToday: true });
            updateSettingsUI();
            setupEventListeners('settings');
        };
        
         $('modal-cancel-btn').addEventListener('click', () => hideConfirmModal());
         $('modal-confirm-btn').addEventListener('click', () => { if(confirmCallback) confirmCallback(); });


        // --- Initial Load Logic ---
        if (userSettings) {
            initializeApp();
        } else {
            showSettingsView();
        }

    } catch (e) {
        console.error("Critical Application Error:", e);
        document.body.innerHTML = `<div class="text-center p-8 text-red-600 bg-white">یک خطای غیرمنتظره و جدی رخ داد. لطفاً حافظه کش مرورگر را پاک کرده و دوباره امتحان کنید. اگر مشکل ادامه داشت، با توسعه‌دهنده تماس بگیرید.</div>`;
    }
});
    </script>
</body>
</html>

