// ======== TOAST NOTIFICATION ========
const TOAST_DURATION = 3500; // ms

function showToast(message, type = 'success') {
    const icons = { success: '✅', error: '❌', warning: '⚠️' };
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || '✅'}</span>
        <span class="toast-msg">${message}</span>
        <button class="toast-close" onclick="removeToast(this.parentElement)">✕</button>
    `;
    // Progress bar duration
    const bar = document.createElement('style');
    const uid = 'tp' + Date.now();
    toast.id = uid;
    bar.textContent = `#${uid}::before { animation-duration: ${TOAST_DURATION}ms; }`;
    document.head.appendChild(bar);

    container.appendChild(toast);

    setTimeout(() => removeToast(toast), TOAST_DURATION);
}

function removeToast(toast) {
    if (!toast || toast.classList.contains('removing')) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 350);
}

// Đọc ?toast= từ URL và hiện thông báo
(function() {
    const params = new URLSearchParams(window.location.search);
    const msg   = params.get('toast');
    const type  = params.get('type') || 'success';
    if (msg) {
        // Xóa param khỏi URL (không reload trang)
        const url = new URL(window.location);
        url.searchParams.delete('toast');
        url.searchParams.delete('type');
        window.history.replaceState({}, '', url);
        // Hiện toast sau khi DOM sẵn sàng
        setTimeout(() => showToast(decodeURIComponent(msg), type), 300);
    }
})();
// ======== THÊM VIP MỚI ĐỘNG ========
let vipCount = 1;
function getVipBlockTitle(index) {
    if (index === 1) return 'Thông tin lãnh đạo';
    if (index === 2) return 'Thông tin kế toán';
    return `Thông Tin Khách VIP Thứ ${index}`;
}

function themVipMoi() {
    vipCount++;
    const container = document.getElementById('vipContainer');
    const div = document.createElement('div');
    div.className = 'section-box mb-3 vip-block';
    div.id = `vip-block-${vipCount-1}`;
    div.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
            <span class="vip-block-header">
                <span class="badge bg-primary me-1">${vipCount}</span> ${getVipBlockTitle(vipCount)}
            </span>
            <button type="button" class="btn btn-sm btn-outline-danger" onclick="this.closest('.vip-block').remove()">✕ Xóa</button>
        </div>
        <div class="row g-2">
            <div class="col-12">
                <label class="form-label">Họ Và Tên VIP <span class="text-danger">*</span></label>
                <input type="text" class="form-control" name="ho_ten" required placeholder="Ví dụ: Trần Thị B">
            </div>
            <div class="col-12">
                <label class="form-label">Chức Vụ <span class="text-danger">*</span></label>
                <select class="form-select" name="chuc_vu_id" required>
                    ${document.querySelector('#vipContainer select[name="chuc_vu_id"]').innerHTML}
                </select>
            </div>
            <div class="col-12">
                <label class="form-label">Ngày Sinh Nhật <span class="text-danger">*</span></label>
                <input type="date" class="form-control" name="ngay_sinh" required oninput="kiemTraNgaySinh(this)">
            </div>
            <div class="col-12">
                <label class="form-label">Số Điện Thoại <span class="text-danger">*</span></label>
                <input type="text" class="form-control" name="so_dien_thoai" required
                       placeholder="Ví dụ: 0987112233" maxlength="10" oninput="kiemTraSoDienThoai(this)">
            </div>
        </div>
    `;
    container.appendChild(div);

    // Cập nhật nút thêm
    const addBtn = document.querySelector('button[onclick="themVipMoi()"]');
    addBtn.textContent = `+ Thêm thông tin VIP thứ ${vipCount + 1}`;
}

function resetForm() {
    dongFormAddCustomer();
}

// ======== MỞ/ĐÓNG MODAL THÊM KHÁCH HÀNG ========
function moFormAddCustomer() {
    const modal = document.getElementById('addCustomerModalBackdrop');
    if (!modal) return;
    
    // Reset form trước khi mở
    resetFormFields();
    
    // Show modal với animation
    modal.classList.add('show');
    
    // Add modal-open class để disable sticky header
    document.body.classList.add('modal-open');
    
    // Disable scroll body
    document.body.style.overflow = 'hidden';
    
    // Focus trường đầu tiên
    setTimeout(() => {
        const firstInput = modal.querySelector('input, select, textarea');
        if (firstInput) firstInput.focus();
    }, 150);
}

function dongFormAddCustomer() {
    const modal = document.getElementById('addCustomerModalBackdrop');
    if (!modal) return;
    
    // Hide modal với animation
    modal.classList.remove('show');
    
    // Remove modal-open class để restore sticky header
    document.body.classList.remove('modal-open');
    
    // Enable scroll body
    document.body.style.overflow = '';
    
    // Reset form sau animation
    setTimeout(() => {
        resetFormFields();
    }, 300);
}

// Đóng modal khi click vào backdrop (ngoài form)
function dongFormAddCustomerIfBackdrop(event) {
    if (event.target.id === 'addCustomerModalBackdrop') {
        dongFormAddCustomer();
    }
}

// Reset form fields
function resetFormFields() {
    const form = document.getElementById('formAddAll');
    if (form) {
        form.reset();
    }
    // Xóa các VIP block thêm động
    const blocks = document.querySelectorAll('.vip-block:not(#vip-block-0)');
    blocks.forEach(b => b.remove());
    vipCount = 1;
    const addBtn = document.querySelector('button[onclick="themVipMoi()"]');
    if (addBtn) {
        addBtn.innerHTML = '<i class="fa-solid fa-plus me-1"></i> Thêm thông tin kế toán';
    }
}

// ======== MODAL CẬP NHẬT KHÁCH HÀNG THEO DÒNG ========
function renderEditFullVipBlock(vip = {}, index = 0) {
    return `
        <div class="section-box edit-full-section edit-full-vip-section mb-4">
            <div class="section-box-title edit-full-vip-title">
                <span>
                    <span class="edit-full-index">${index + 1}</span>
                    <span class="edit-full-title-text">${getVipBlockTitle(index + 1)}</span>
                </span>
            </div>
            <input type="hidden" name="vip_id" value="${escapeHistoryHtml(vip.id || '')}">
            <input type="hidden" name="chuc_vu_id" value="${escapeHistoryHtml(vip.chuc_vu_id || '')}">
            <div class="row g-3">
                <div class="col-md-4">
                    <label class="form-label">Họ và tên VIP <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" name="ho_ten" value="${escapeHistoryHtml(vip.ho_ten || '')}" required>
                </div>
                <div class="col-md-4">
                    <label class="form-label">Ngày sinh nhật <span class="text-danger">*</span></label>
                    <input type="date" class="form-control" name="ngay_sinh" value="${escapeHistoryHtml(vip.ngay_sinh || '')}" required oninput="kiemTraNgaySinh(this)">
                </div>
                <div class="col-md-4">
                    <label class="form-label">Số điện thoại <span class="text-danger">*</span></label>
                    <input type="text" class="form-control" name="so_dien_thoai" value="${escapeHistoryHtml(vip.so_dien_thoai || '')}" maxlength="10" required oninput="kiemTraSoDienThoai(this)">
                </div>
            </div>
        </div>
    `;
}

function moFormEditCustomer(customerId) {
    const dataNode = document.getElementById('customer-edit-data-' + customerId);
    const modal = document.getElementById('editCustomerFullModalBackdrop');
    const form = document.getElementById('formEditCustomerFull');
    if (!dataNode || !modal || !form) return;

    let data;
    try {
        data = JSON.parse(dataNode.textContent || '{}');
    } catch (error) {
        console.error('Lỗi đọc dữ liệu khách hàng:', error);
        alert('Không thể mở dữ liệu chỉnh sửa khách hàng.');
        return;
    }

    form.reset();
    document.getElementById('editFullCustomerId').value = data.id || '';
    document.getElementById('editFullMaKh').value = data.ma_kh || '';
    document.getElementById('editFullTenKhachHang').value = data.ten_khach_hang || '';
    document.getElementById('editFullCanBoId').value = data.can_bo_id || '';
    document.getElementById('editFullNgayThanhLap').value = data.ngay_thanh_lap || '';

    const vipContainer = document.getElementById('editFullVipContainer');
    const vipList = Array.isArray(data.ds_vip) ? data.ds_vip : [];

    vipContainer.innerHTML = vipList.length ? vipList.map((vip, index) => renderEditFullVipBlock(vip, index)).join('') : `
        <div class="section-box edit-full-section mb-4 edit-full-empty">
            <div class="text-muted small">Doanh nghiệp này chưa có thông tin VIP để cập nhật.</div>
        </div>
    `;

    modal.classList.add('show');
    document.body.classList.add('modal-open');
    document.body.style.overflow = 'hidden';

    setTimeout(() => {
        document.getElementById('editFullMaKh')?.focus();
    }, 150);
}

function dongFormEditCustomer() {
    const modal = document.getElementById('editCustomerFullModalBackdrop');
    if (!modal) return;

    modal.classList.remove('show');
    document.body.classList.remove('modal-open');
    document.body.style.overflow = '';
}

function dongFormEditCustomerIfBackdrop(event) {
    if (event.target.id === 'editCustomerFullModalBackdrop') {
        dongFormEditCustomer();
    }
}

// ======== MODAL VIP DETAIL ========
let currentVipEditData = {};
let currentVipId = null;

function getVipInitials(name) {
    return String(name || '')
        .trim()
        .split(/\s+/)
        .slice(-2)
        .map(part => part.charAt(0))
        .join('')
        .toUpperCase() || 'VIP';
}

function setVipDetailArrow(vipId, active) {
    const card = document.getElementById('vip-view-' + vipId);
    if (card) card.classList.toggle('is-active', active);
}

function toLocalDateObject(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function formatLocalDate(value) {
    const date = toLocalDateObject(value);
    return date ? date.toLocaleDateString('vi-VN') : '---';
}

function toLocalDateInputValue(value) {
    const date = toLocalDateObject(value);
    if (!date) return '';
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}

async function openVipDetail(vipId) {
    try {
        // Fetch dữ liệu VIP + ghi chú
        const response = await fetch(`/api/vip/${vipId}`);
        if (!response.ok) {
            console.error('API Error:', response.status, response.statusText);
            alert('Không thể lấy thông tin VIP: ' + response.status);
            return;
        }
        
        const responseText = await response.text();
        console.log('API Response:', responseText);
        
        let data;
        try {
            data = JSON.parse(responseText);
        } catch (parseErr) {
            console.error('JSON Parse Error:', parseErr, 'Response was:', responseText);
            alert('Lỗi parse JSON: ' + parseErr.message);
            return;
        }
        
        const vip = data.vip;
        const lichSu = data.lichSu || [];

        // Lưu dữ liệu hiện tại để restore khi hủy edit
        currentVipEditData = JSON.parse(JSON.stringify(vip));
        if (currentVipId !== null && currentVipId !== vipId) {
            setVipDetailArrow(currentVipId, false);
        }
        currentVipId = vipId;
        setVipDetailArrow(vipId, true);

        // Populate dữ liệu vào modal
        document.getElementById('vipDetailId').value = vip.id;
        document.getElementById('vipDetailKhachHangId').value = vip.khach_hang_id;
        document.getElementById('vipDetailName').textContent = vip.ho_ten;
        document.getElementById('vipDetailHoTen').textContent = vip.ho_ten;
        document.getElementById('vipEditHoTen').value = vip.ho_ten;
        document.getElementById('vipDetailAvatar').textContent = getVipInitials(vip.ho_ten);
        document.getElementById('vipDetailProfileName').textContent = vip.ho_ten;
        document.getElementById('vipDetailProfileCompany').textContent = vip.ten_khach_hang || 'Chưa có doanh nghiệp';
        
        document.getElementById('vipDetailChucVu').textContent = vip.chuc_vu || '---';
        document.getElementById('vipEditChucVu').value = vip.chuc_vu_id || '';
        
        const ngaySinh = formatLocalDate(vip.ngay_sinh);
        document.getElementById('vipDetailNgaySinh').textContent = ngaySinh;
        document.getElementById('vipEditNgaySinh').value = toLocalDateInputValue(vip.ngay_sinh);
        
        document.getElementById('vipDetailSdt').textContent = vip.so_dien_thoai || '---';
        document.getElementById('vipEditSdt').value = vip.so_dien_thoai || '';
        
        document.getElementById('vipDetailEmail').textContent = vip.email || '---';
        document.getElementById('vipEditEmail').value = vip.email || '';
        
        document.getElementById('vipDetailTenKh').textContent = vip.ten_khach_hang || '---';
        document.getElementById('vipEditTenKh').value = vip.ten_khach_hang || '';
        
        const ngayThanhLap = formatLocalDate(vip.ngay_thanh_lap);
        document.getElementById('vipDetailNgayThanhLap').textContent = ngayThanhLap;
        document.getElementById('vipEditNgayThanhLap').value = toLocalDateInputValue(vip.ngay_thanh_lap);

        // Populate ghi chú chăm sóc
        const notesList = document.getElementById('vipDetailNotesList');
        document.getElementById('vipDetailNotesCount').textContent = lichSu.length;
        if (lichSu.length === 0) {
            notesList.innerHTML = '<li style="text-align: center; color: var(--text-light); padding: 10px;">Chưa có ghi chú nào</li>';
        } else {
            notesList.innerHTML = lichSu.map(note => `
                <li class="vip-note-item">
                    <div>
                        <div class="vip-note-content">${note.noi_dung || ''}</div>
                        <div class="vip-note-date">📅 ${new Date(note.ngay_lien_he).toLocaleDateString('vi-VN')}</div>
                    </div>
                    <div class="vip-note-actions">
                        <button type="button" class="vip-note-delete-btn" onclick="deleteNote(${note.id})">🗑</button>
                    </div>
                </li>
            `).join('');
        }

        // Ẩn form thêm ghi chú
        document.getElementById('vipAddNoteForm').style.display = 'none';
        document.getElementById('vipNewNoteContent').value = '';
        document.getElementById('vipNewNoteDate').value = new Date().toISOString().split('T')[0];

        // Exit edit mode
        const modalContent = document.querySelector('.vip-detail-modal-content');
        modalContent.classList.remove('editing');
        document.querySelector('.vip-detail-footer').classList.remove('edit-mode');

        // Show modal
        const backdrop = document.getElementById('vipDetailModalBackdrop');
        backdrop.classList.add('show');
        document.body.classList.add('modal-open');
    } catch (error) {
        setVipDetailArrow(vipId, false);
        console.error('Lỗi mở VIP detail:', error);
        alert('Lỗi: ' + error.message);
    }
}

function closeVipDetail() {
    const backdrop = document.getElementById('vipDetailModalBackdrop');
    backdrop.classList.remove('show');
    document.body.classList.remove('modal-open');
    if (currentVipId !== null) setVipDetailArrow(currentVipId, false);
    
    setTimeout(() => {
        currentVipEditData = {};
        currentVipId = null;
    }, 300);
}

function closeVipDetailIfBackdrop(event) {
    if (event.target.id === 'vipDetailModalBackdrop') {
        closeVipDetail();
    }
}

function toggleVipEditMode() {
    const modalContent = document.querySelector('.vip-detail-modal-content');
    const footer = document.querySelector('.vip-detail-footer');
    
    modalContent.classList.add('editing');
    footer.classList.add('edit-mode');
}

function cancelVipEdit() {
    const modalContent = document.querySelector('.vip-detail-modal-content');
    const footer = document.querySelector('.vip-detail-footer');
    
    // Restore dữ liệu cũ
    document.getElementById('vipEditHoTen').value = currentVipEditData.ho_ten || '';
    document.getElementById('vipEditChucVu').value = currentVipEditData.chuc_vu_id || '';
    document.getElementById('vipEditNgaySinh').value = toLocalDateInputValue(currentVipEditData.ngay_sinh);
    document.getElementById('vipEditSdt').value = currentVipEditData.so_dien_thoai || '';
    document.getElementById('vipEditEmail').value = currentVipEditData.email || '';
    document.getElementById('vipEditTenKh').value = currentVipEditData.ten_khach_hang || '';
    document.getElementById('vipEditNgayThanhLap').value = toLocalDateInputValue(currentVipEditData.ngay_thanh_lap);
    
    modalContent.classList.remove('editing');
    footer.classList.remove('edit-mode');
}

async function saveVipEdit() {
    try {
        const vipData = {
            id: document.getElementById('vipDetailId').value,
            ho_ten: document.getElementById('vipEditHoTen').value,
            chuc_vu_id: document.getElementById('vipEditChucVu').value,
            ngay_sinh: document.getElementById('vipEditNgaySinh').value,
            so_dien_thoai: document.getElementById('vipEditSdt').value,
            email: document.getElementById('vipEditEmail').value,
            khach_hang_id: document.getElementById('vipDetailKhachHangId').value
        };

        const khachHangData = {
            ten_khach_hang: document.getElementById('vipEditTenKh').value,
            ngay_thanh_lap: document.getElementById('vipEditNgayThanhLap').value
        };

        // Cập nhật VIP
        const vipRes = await fetch('/khach-hang/vip/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(vipData)
        });

        if (!vipRes.ok) throw new Error('Lỗi cập nhật VIP');

        // Cập nhật Khách Hàng
        const khRes = await fetch('/khach-hang/update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                id: document.getElementById('vipDetailKhachHangId').value,
                ...khachHangData
            })
        });

        if (!khRes.ok) throw new Error('Lỗi cập nhật doanh nghiệp');

        // Reload dữ liệu
        await openVipDetail(currentVipId);
        showToast('Cập nhật thành công!', 'success');
    } catch (error) {
        console.error('Lỗi lưu:', error);
        alert('Lỗi: ' + error.message);
    }
}

function openAddNoteForm() {
    document.getElementById('vipAddNoteForm').style.display = 'block';
    document.getElementById('vipNewNoteDate').value = new Date().toISOString().split('T')[0];
}

function cancelAddNote() {
    document.getElementById('vipAddNoteForm').style.display = 'none';
    document.getElementById('vipNewNoteContent').value = '';
}

async function saveNote() {
    const content = document.getElementById('vipNewNoteContent').value.trim();
    const date = document.getElementById('vipNewNoteDate').value;

    if (!content) {
        alert('Vui lòng nhập nội dung ghi chú!');
        return;
    }

    try {
        const res = await fetch('/lich-su/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                vip_id: currentVipId,
                ngay_lien_he: date,
                noi_dung: content,
                nguoi_phu_trach: ''
            })
        });

        if (res.ok) {
            // Reload modal
            await openVipDetail(currentVipId);
            showToast('Thêm ghi chú thành công!', 'success');
        }
    } catch (error) {
        console.error('Lỗi thêm ghi chú:', error);
        alert('Lỗi: ' + error.message);
    }
}

async function deleteNote(noteId) {
    if (!confirm('Xóa ghi chú này?')) return;

    try {
        const res = await fetch(`/lich-su/delete/${noteId}`);
        if (res.ok) {
            await openVipDetail(currentVipId);
            showToast('Xóa ghi chú thành công!', 'success');
        }
    } catch (error) {
        console.error('Lỗi xóa ghi chú:', error);
        alert('Lỗi: ' + error.message);
    }
}

// ======== MODAL & EVENT DELEGATION ========
let modalXoa, modalVip;
document.addEventListener('DOMContentLoaded', function () {
    modalXoa = new bootstrap.Modal(document.getElementById('modalXoa'));
    modalVip = new bootstrap.Modal(document.getElementById('modalXoaVip'));

    document.getElementById('btnHuyModalKH').onclick = () => modalXoa.hide();
    document.getElementById('btnHuyModalVip').onclick = () => modalVip.hide();

    // ---- ESC key để đóng modal thêm khách hàng ----
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            const modal = document.getElementById('addCustomerModalBackdrop');
            if (modal && modal.classList.contains('show')) {
                dongFormAddCustomer();
            }
            const editModal = document.getElementById('editCustomerFullModalBackdrop');
            if (editModal && editModal.classList.contains('show')) {
                dongFormEditCustomer();
            }
        }
    });

    // ---- Khách hàng ----
    const vipTable = document.getElementById('tableVip');
    if (vipTable) {
        vipTable.addEventListener('click', function(e) {
            const btn = e.target.closest('button');
            if (!btn) return;
            const id = btn.dataset.id;
            if (btn.classList.contains('btn-edit-customer-full')) {
                moFormEditCustomer(id);
            } else if (btn.classList.contains('btn-xoa-kh')) {
                document.getElementById('tenCanXoa').innerText = btn.dataset.ten;
                document.getElementById('linkXacNhanXoa').href = '/khach-hang/delete/' + id;
                modalXoa.show();
            } else if (btn.classList.contains('btn-xoa-vip')) {
                document.getElementById('tenVipCanXoa').innerText = btn.dataset.ten;
                document.getElementById('linkXacNhanXoaVip').href = '/khach-hang/vip/delete/' + id;
                modalVip.show();
            }
        });
    }

    // ---- Tìm kiếm và giới hạn dòng phía server ----
    document.getElementById('searchVip').addEventListener('keydown', function(e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        updateCustomerListQuery({ keyword: this.value.trim(), chucVu: 'all', page: 1 });
    });

    document.getElementById('paginationLimit').addEventListener('change', function() {
        updateCustomerListQuery({ limit: this.value, chucVu: 'all', page: 1 });
    });
});

function updateCustomerListQuery(changes) {
    const url = new URL(window.location.href);
    Object.entries(changes).forEach(([key, value]) => {
        if (value === '' || value === null || value === undefined || (key === 'chucVu' && value === 'all')) {
            url.searchParams.delete(key);
        } else {
            url.searchParams.set(key, value);
        }
    });
    window.location.href = url.toString();
}

function toggleNotificationPanel(event) {
    event.stopPropagation();
    const panel = document.getElementById('notificationPanel');
    const bell = document.getElementById('notificationBell');
    const isOpen = panel.classList.toggle('show');
    bell.classList.toggle('active', isOpen);
}

function closeNotificationPanel() {
    document.getElementById('notificationPanel')?.classList.remove('show');
    document.getElementById('notificationBell')?.classList.remove('active');
}

document.addEventListener('click', function(event) {
    if (!event.target.closest('#notificationWrap')) closeNotificationPanel();
});

document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeNotificationPanel();
});

document.addEventListener('DOMContentLoaded', function() {
    const effects = document.getElementById('celebrationEffects');
    if (!effects) return;

    const symbols = ['🎉', '🎊', '✨', '🎂', '⭐'];
    for (let i = 0; i < 34; i++) {
        const particle = document.createElement('span');
        particle.className = 'celebration-particle';
        particle.textContent = symbols[i % symbols.length];
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.setProperty('--duration', `${3 + Math.random() * 3}s`);
        particle.style.setProperty('--drift', `${-80 + Math.random() * 160}px`);
        particle.style.animationDelay = `${Math.random() * 1.4}s`;
        effects.appendChild(particle);
    }

    setTimeout(() => effects.remove(), 7000);
});

// ======== VALIDATION ========
function kiemTraNgaySinh(input) {
    if (!input.value) return;
    const y = parseInt(input.value.split('-')[0]);
    if (y > new Date().getFullYear()) {
        input.setCustomValidity('Năm sinh không hợp lệ!');
    } else { input.setCustomValidity(''); }
}
function kiemTraSoDienThoai(input) {
    const sdt = input.value;
    if (!sdt) { input.setCustomValidity(''); return; }
    if (!/^(03|04|07|08|09)[0-9]{8}$/.test(sdt)) {
        input.setCustomValidity('SĐT phải đủ 10 số, bắt đầu bằng 03/04/07/08/09.');
    } else { input.setCustomValidity(''); }
}

// ======== BADGE CHỨC VỤ THEO CẤP BẬC ========
// Cấp 1: Lãnh đạo cao nhất
const CAP1 = ['giám đốc','phó giám đốc','tổng giám đốc','phó tổng giám đốc',
               'chủ tịch','phó chủ tịch','chủ tịch hội đồng quản trị','phó chủ tịch hội đồng quản trị',
               'hiệu trưởng','phó hiệu trưởng','hiệu phó','lãnh đạo',
               'bí thư','phó bí thư','chủ tịch ubnd','phó chủ tịch ubnd',
               'giám đốc sở','phó giám đốc sở','viện trưởng','phó viện trưởng'];
// Cấp 2: Quản lý trung cấp
const CAP2 = ['trưởng phòng','phó trưởng phòng','trưởng ban','phó ban','trưởng bộ phận',
               'trưởng nhóm','team lead','quản lý','manager','supervisor',
               'trưởng khoa','phó trưởng khoa','tổ trưởng','tổ phó',
               'trưởng chi nhánh','phó chi nhánh','giám sát'];

function getChucVuBadgeClass(ten) {
    if (!ten) return 'badge-cap3';
    const lower = ten.toLowerCase().trim();
    if (CAP1.some(k => lower.includes(k))) return 'badge-cap1';
    if (CAP2.some(k => lower.includes(k))) return 'badge-cap2';
    return 'badge-cap3';
}

// Áp dụng cho tất cả badge chức vụ sau khi DOM load
document.addEventListener('DOMContentLoaded', function () {

    // Static stat values (animation removed)

    // ---- FAVICON & TITLE ĐỘNG ----
    (function updateFaviconTitle() {
        // Đếm số sinh nhật hôm nay từ badge "Hôm nay!"
        const todayBadges = document.querySelectorAll('.birthday-badge.today');
        const count = todayBadges.length;

        // Cập nhật title tab
        if (count > 0) {
            document.title = `🎂 ${count} sinh nhật | CRM Agribank`;
        } else {
            document.title = 'Quản lý Khách hàng & VIP | CRM Agribank';
        }

        // Tạo favicon động bằng Canvas
        const canvas = document.createElement('canvas');
        canvas.width = 32; canvas.height = 32;
        const ctx = canvas.getContext('2d');

        // Nền tròn đỏ đô
        ctx.beginPath();
        ctx.arc(16, 16, 15, 0, 2 * Math.PI);
        ctx.fillStyle = '#8C1D40';
        ctx.fill();

        if (count > 0) {
            // Có sinh nhật hôm nay — hiện số
            ctx.fillStyle = '#D4AF37';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(count > 9 ? '9+' : count.toString(), 16, 17);
        } else {
            // Không có — hiện chữ "A" (Agribank)
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('A', 16, 17);
        }

        // Gán favicon
        let link = document.querySelector("link[rel~='icon']");
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.href = canvas.toDataURL();
    })();
    document.querySelectorAll('.badge.bg-secondary').forEach(function (badge) {
        const text = badge.textContent.trim();
        if (!text || text === '---') return;
        const cls = getChucVuBadgeClass(text);
        badge.classList.remove('bg-secondary');
        badge.classList.add(cls);
    });

    // ---- THANH TIẾN TRÌNH CHĂM SÓC ----
    document.querySelectorAll('.care-progress-bar').forEach(function(bar) {
        const label = bar.closest('td').querySelector('.care-progress-label');
        const lastCare = bar.dataset.lastcare;

        if (!lastCare) {
            bar.classList.add('never');
            if (label) { label.className = 'care-progress-label never'; label.textContent = 'Chưa có lịch sử'; }
            return;
        }

        // Parse chuẩn — tránh lệch múi giờ
        const parts = String(lastCare).split('T')[0].split('-');
        if (parts.length < 3) return;
        const last = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const days = Math.round((today - last) / (1000 * 60 * 60 * 24));

        // Nếu days âm (dữ liệu lạ) → coi như vừa chăm sóc
        const d = Math.max(0, days);

        let cls, text, pct;
        if (d <= 30) {
            cls = 'fresh';
            pct = Math.max(15, 100 - (d / 30) * 65);
            text = d === 0 ? 'Vừa chăm sóc' : `${d} ngày trước`;
        } else if (d <= 90) {
            cls = 'medium';
            pct = Math.max(10, 35 - ((d - 30) / 60) * 25);
            text = `${d} ngày trước`;
        } else {
            cls = 'stale';
            pct = 10;
            text = d > 365
                ? `Hơn ${Math.floor(d / 365)} năm trước`
                : `${d} ngày trước`;
        }

        bar.classList.add(cls);
        if (label) { label.className = 'care-progress-label ' + cls; label.textContent = text; }
        setTimeout(() => { bar.style.width = pct + '%'; }, 120);
    });

    // ---- HIGHLIGHT SINH NHẬT SẮP TỚI ----
    function tinhNgayConLai(ngaySinhStr) {
        if (!ngaySinhStr) return null;
        const today = new Date();
        const parts = ngaySinhStr.split('-');
        if (parts.length < 3) return null;
        const month = parseInt(parts[1]) - 1;
        const day   = parseInt(parts[2]);
        let birthday = new Date(today.getFullYear(), month, day);
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        if (birthday < todayMidnight) {
            birthday = new Date(today.getFullYear() + 1, month, day);
        }
        return Math.round((birthday - todayMidnight) / (1000 * 60 * 60 * 24));
    }

    document.querySelectorAll('.vip-card[data-ngaysinh]').forEach(function(row) {
        const days = tinhNgayConLai(row.dataset.ngaysinh);
        if (days === null) return;
        const badge = row.querySelector('.birthday-badge');
        if (!badge) return;

        if (days === 0) {
            badge.className = 'birthday-badge today';
            badge.innerHTML = '🎂 Hôm nay!';
            badge.style.display = 'inline-flex';
            row.classList.add('birthday-today');
        } else if (days <= 3) {
            badge.className = 'birthday-badge soon-3';
            badge.innerHTML = `⏰ Còn ${days} ngày`;
            badge.style.display = 'inline-flex';
        } else if (days <= 7) {
            badge.className = 'birthday-badge soon-7';
            badge.innerHTML = `🔔 Còn ${days} ngày`;
            badge.style.display = 'inline-flex';
        }
    });

    // ---- EVENT DELEGATION: LỊCH SỬ (trong accordion) ----
    document.querySelectorAll('.customer-date[data-ngaythanhlap]').forEach(function(cell) {
        const days = tinhNgayConLai(cell.dataset.ngaythanhlap);
        if (days === null || days > 7) return;

        const badge = cell.querySelector('.company-event-badge');
        if (!badge) return;

        if (days === 0) {
            badge.className = 'birthday-badge company-event-badge today';
            badge.innerHTML = '<i class="fa-solid fa-building-circle-check"></i> H&ocirc;m nay';
        } else if (days <= 3) {
            badge.className = 'birthday-badge company-event-badge soon-3';
            badge.innerHTML = `<i class="fa-solid fa-clock"></i> C&ograve;n ${days} ng&agrave;y`;
        } else {
            badge.className = 'birthday-badge company-event-badge soon-7';
            badge.innerHTML = `<i class="fa-solid fa-bell"></i> C&ograve;n ${days} ng&agrave;y`;
        }
    });

    const modalLS = new bootstrap.Modal(document.getElementById('modalXoaLichSu'));
    document.getElementById('btnHuyModalLS').onclick = () => modalLS.hide();

    document.addEventListener('click', function(e) {
        const btn = e.target.closest('button');
        if (!btn) return;
        const id = btn.dataset.id;

        if (btn.classList.contains('ls-btn-sua')) {
            document.getElementById('ls-view-' + id).style.display = 'none';
            document.getElementById('ls-edit-' + id).style.display = '';
        } else if (btn.classList.contains('ls-btn-huy')) {
            document.getElementById('ls-edit-' + id).style.display = 'none';
            document.getElementById('ls-view-' + id).style.display = '';
        } else if (btn.classList.contains('ls-btn-luu')) {
            document.getElementById('form-ls-' + id).submit();
        } else if (btn.classList.contains('ls-btn-xoa')) {
            document.getElementById('tenLichSuCanXoa').textContent = btn.dataset.ten;
            document.getElementById('linkXacNhanXoaLS').href = '/lich-su/delete/' + id;
            modalLS.show();
        }
    });
});

// ======== ACCORDION LỊCH SỬ ========
function escapeHistoryHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatHistoryDate(value, inputFormat = false) {
    if (!value) return '';
    const raw = String(value).split('T')[0];
    if (inputFormat) return raw;

    const parts = raw.split('-');
    if (parts.length !== 3) return escapeHistoryHtml(value);
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function renderHistoryRows(lichSu, role) {
    if (!lichSu.length) {
        return `
            <div style="text-align:center;padding:16px;color:var(--text-light);font-size:0.82rem;">
                <i class="fa-regular fa-folder-open me-1"></i>Chưa có lịch sử chăm sóc nào.
            </div>
        `;
    }

    const canEdit = role === 'admin' || role === 'can_bo';
    const canDelete = role === 'admin';
    const rows = lichSu.map(ls => {
        const id = Number(ls.id);
        const vipId = Number(ls.vip_id);
        const ngayLienHe = formatHistoryDate(ls.ngay_lien_he, true);
        const quaTang = escapeHistoryHtml(ls.qua_tang || '');
        const tenVip = escapeHistoryHtml(ls.ten_vip || '');

        return `
            <tr id="ls-view-${id}" class="ls-item-row">
                <td style="padding:8px 12px;">
                    <span class="badge bg-light text-dark border" style="font-size:0.72rem;">
                        <i class="fa-regular fa-calendar me-1"></i>${formatHistoryDate(ls.ngay_lien_he)}
                    </span>
                </td>
                <td style="padding:8px 12px;font-size:0.85rem;">${escapeHistoryHtml(ls.noi_dung)}</td>
                <td style="padding:8px 12px;">
                    ${quaTang
                        ? `<span class="badge bg-warning text-dark" style="font-size:0.72rem;"><i class="fa-solid fa-gift me-1"></i>${quaTang}</span>`
                        : '<span class="text-muted small">---</span>'}
                </td>
                <td style="padding:8px 12px;font-size:0.85rem;">${escapeHistoryHtml(ls.nguoi_phu_trach)}</td>
                <td style="padding:8px 12px;text-align:center;white-space:nowrap;">
                    ${canEdit ? `
                        <button class="btn btn-sm btn-outline-warning me-1 ls-btn-sua" data-id="${id}">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                    ` : ''}
                    ${canDelete ? `
                        <button class="btn btn-sm btn-outline-danger ls-btn-xoa"
                                data-id="${id}" data-ten="${tenVip}">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    ` : ''}
                    ${role === 'truong_phong' ? '<span class="text-muted">---</span>' : ''}
                </td>
            </tr>
            <tr id="ls-edit-${id}" style="display:none;" class="table-light">
                <td colspan="4" style="padding:8px 12px;">
                    <form id="form-ls-${id}" action="/lich-su/update" method="POST">
                        <input type="hidden" name="id" value="${id}">
                        <input type="hidden" name="vip_id" value="${vipId}">
                        <div class="row g-2">
                            <div class="col-md-2">
                                <input type="date" class="form-control form-control-sm"
                                       name="ngay_lien_he" value="${escapeHistoryHtml(ngayLienHe)}" required>
                            </div>
                            <div class="col-md-4">
                                <input type="text" class="form-control form-control-sm"
                                       name="noi_dung" value="${escapeHistoryHtml(ls.noi_dung)}" required>
                            </div>
                            <div class="col-md-3">
                                <input type="text" class="form-control form-control-sm"
                                       name="qua_tang" value="${quaTang}"
                                       placeholder="Quà tặng (nếu có)">
                            </div>
                            <div class="col-md-3">
                                <input type="text" class="form-control form-control-sm"
                                       name="nguoi_phu_trach" value="${escapeHistoryHtml(ls.nguoi_phu_trach)}" required>
                            </div>
                        </div>
                    </form>
                </td>
                <td style="padding:8px 12px;text-align:center;white-space:nowrap;">
                    <button class="btn btn-sm btn-success me-1 ls-btn-luu" data-id="${id}">
                        <i class="fa-solid fa-floppy-disk"></i>
                    </button>
                    <button class="btn btn-sm btn-secondary ls-btn-huy" data-id="${id}">✕</button>
                </td>
            </tr>
        `;
    }).join('');

    return `
        <table class="table table-sm align-middle mb-0" style="background:var(--white);border-radius:var(--radius);overflow:hidden;">
            <thead>
                <tr style="background:rgba(212,175,55,0.1);">
                    <th style="font-size:0.68rem;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent-dark);padding:8px 12px;">Ngày Liên Hệ</th>
                    <th style="font-size:0.68rem;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent-dark);padding:8px 12px;">Nội Dung</th>
                    <th style="font-size:0.68rem;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent-dark);padding:8px 12px;">Quà Tặng</th>
                    <th style="font-size:0.68rem;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent-dark);padding:8px 12px;">Người P.Trách</th>
                    <th style="font-size:0.68rem;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;color:var(--accent-dark);padding:8px 12px;text-align:center;">Thao Tác</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

async function loadLichSu(vipId, forceReload = false) {
    const container = document.getElementById('lich-su-content-' + vipId);
    if (!container || (container.dataset.loaded === 'true' && !forceReload)) return;
    if (container.dataset.loading === 'true') return;

    container.dataset.loading = 'true';
    container.innerHTML = `
        <div style="text-align:center;padding:16px;color:var(--text-light);font-size:0.82rem;">
            <span class="spinner-border spinner-border-sm me-2" role="status"></span>Đang tải lịch sử chăm sóc...
        </div>
    `;

    try {
        const response = await fetch(`/api/lich-su/${vipId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Không thể tải lịch sử chăm sóc');

        const lichSu = Array.isArray(data.lichSu) ? data.lichSu : [];
        container.innerHTML = renderHistoryRows(lichSu, container.dataset.userRole);
        container.dataset.loaded = 'true';

        const vipRow = document.getElementById('vip-view-' + vipId);
        if (vipRow) vipRow.dataset.vipLichSuCount = String(lichSu.length);
        const button = document.querySelector(`button[onclick^="openVipHistory(${Number(vipId)},"]`);
        const count = button?.querySelector('.acc-count');
        if (count) {
            count.textContent = lichSu.length;
            count.style.display = lichSu.length ? '' : 'none';
        }
        const summaryCount = vipRow?.querySelector('.acc-summary-count');
        if (summaryCount) summaryCount.textContent = String(lichSu.length);
    } catch (error) {
        container.innerHTML = `
            <div style="text-align:center;padding:16px;color:var(--primary);font-size:0.82rem;">
                <div class="mb-2">${escapeHistoryHtml(error.message)}</div>
                <button type="button" class="btn btn-sm btn-outline-danger" onclick="loadLichSu(${Number(vipId)}, true)">
                    <i class="fa-solid fa-rotate me-1"></i>Thử lại
                </button>
            </div>
        `;
    } finally {
        container.dataset.loading = 'false';
    }
}

async function openVipHistory(vipId, customerId) {
    const row = document.getElementById('customer-history-' + customerId);
    const content = document.getElementById('customer-history-content-' + customerId);
    if (!row || !content) return;

    const sameVipOpen = row.style.display !== 'none' && content.dataset.vipId === String(vipId);
    document.querySelectorAll('.customer-detail-row[id^="customer-history-"]').forEach(item => {
        item.style.display = 'none';
    });
    if (sameVipOpen) return;

    const vipName = document.getElementById('vip-view-' + vipId)
        ?.querySelector('.vip-card-name')?.textContent.trim() || 'VIP';
    content.dataset.vipId = String(vipId);
    content.innerHTML = `
        <div class="history-panel-header">
            <div>
                <strong>Lịch sử chăm sóc</strong>
                <span>${escapeHistoryHtml(vipName)}</span>
            </div>
            <button type="button" class="btn btn-sm btn-accent" onclick="moFormThemLS(${Number(vipId)})">
                <i class="fa-solid fa-plus me-1"></i>Thêm lịch sử
            </button>
        </div>
        <div id="form-them-ls-${Number(vipId)}" class="history-add-form" style="display:none;">
            <form action="/lich-su/add" method="POST">
                <input type="hidden" name="vip_id" value="${Number(vipId)}">
                <div class="row g-2">
                    <div class="col-md-2">
                        <label class="form-label">Ngày liên hệ</label>
                        <input type="date" class="form-control form-control-sm" name="ngay_lien_he" required>
                    </div>
                    <div class="col-md-4">
                        <label class="form-label">Nội dung</label>
                        <input type="text" class="form-control form-control-sm" name="noi_dung" required>
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Quà tặng</label>
                        <input type="text" class="form-control form-control-sm" name="qua_tang">
                    </div>
                    <div class="col-md-3">
                        <label class="form-label">Người phụ trách</label>
                        <input type="text" class="form-control form-control-sm" name="nguoi_phu_trach" required>
                    </div>
                </div>
                <div class="mt-2 d-flex gap-2">
                    <button type="submit" class="btn btn-sm btn-success">Lưu</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="dongFormThemLS(${Number(vipId)})">Đóng</button>
                </div>
            </form>
        </div>
        <div id="lich-su-content-${Number(vipId)}" class="lich-su-lazy-content"
             data-user-role="admin" data-loaded="false"></div>
    `;
    row.style.display = '';
    await loadLichSu(vipId);
    row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function moFormThemLS(vipId) {
    const form = document.getElementById('form-them-ls-' + vipId);
    form.style.display = form.style.display === 'none' ? '' : 'none';
}

function dongFormThemLS(vipId) {
    document.getElementById('form-them-ls-' + vipId).style.display = 'none';
}

function toggleCustomerVipList(customerId) {
    const row = document.getElementById('customer-more-vip-' + customerId);
    if (!row) return;
    row.style.display = row.style.display === 'none' ? '' : 'none';
}

// ======== BỘ LỌC CHỨC VỤ VIP ========
const CAP1_KEYS = ['giám đốc','phó giám đốc','tổng giám đốc','chủ tịch','phó chủ tịch','hiệu trưởng','phó hiệu trưởng','hiệu phó','lãnh đạo','bí thư','phó bí thư','viện trưởng'];
const CAP2_KEYS = ['trưởng phòng','phó trưởng phòng','trưởng ban','trưởng bộ phận','trưởng nhóm','quản lý','tổ trưởng','trưởng khoa','trưởng chi nhánh'];

function getCapFromChucVu(ten) {
    const l = ten.toLowerCase();
    if (CAP1_KEYS.some(k => l.includes(k))) return 'cap1';
    if (CAP2_KEYS.some(k => l.includes(k))) return 'cap2';
    return 'cap3';
}

// ======== HOVER NEON CHO TÊN DOANH NGHIỆP TRONG DARK MODE ========
document.querySelectorAll('.dn-item-row').forEach(function(row) {
    const nameEl = row.querySelector('.dn-name');
    if (!nameEl) return;
    row.addEventListener('mouseenter', function() {
        if (document.body.classList.contains('dark-mode')) {
            nameEl.style.setProperty('color', '#60A5FA', 'important');
            nameEl.style.setProperty('text-shadow', '0 0 10px rgba(96,165,250,0.6)', 'important');
        }
    });
    row.addEventListener('mouseleave', function() {
        if (document.body.classList.contains('dark-mode')) {
            nameEl.style.removeProperty('color');
            nameEl.style.removeProperty('text-shadow');
        }
    });
});

// ======== COMMAND PALETTE ========
// Thu thập dữ liệu từ DOM sau khi load
let cmdData = [];

document.addEventListener('DOMContentLoaded', function() {
    // Lấy danh sách VIP
    document.querySelectorAll('.vip-card').forEach(row => {
        const name    = row.querySelector('.vip-card-name')?.textContent.trim() || '';
        const customerRow = row.closest('.vip-company-row');
        const donVi   = customerRow?.querySelector('.customer-name')?.textContent.trim() || '';
        const details = row.querySelectorAll('.vip-card-detail');
        const sdt     = details.length ? details[details.length - 1].textContent.trim() : '';
        const id      = row.id.replace('vip-view-', '');
        if (name) cmdData.push({ type:'vip', name, sub: donVi, sdt, id });
    });

    // Lấy danh sách doanh nghiệp
    document.querySelectorAll('.vip-company-row').forEach(row => {
        const name  = row.querySelector('.customer-name')?.textContent.trim() || '';
        const ngay  = row.querySelectorAll('td')[2]?.textContent.trim() || '';
        const id    = row.dataset.customerId || '';
        if (name) cmdData.push({ type:'dn', name, sub: `Ngày thành lập: ${ngay}`, id });
    });
});

// Lệnh điều hướng nhanh
const CMD_NAV = [
    { type:'nav', name:'Màn hình chính', sub:'Chuyển đến trang Dashboard', icon:'fa-house-chimney', url:'/' },
];

let cmdSelected = -1;

function openCmdPalette() {
    const overlay = document.getElementById('cmdOverlay');
    overlay.classList.add('open');
    setTimeout(() => {
        const input = document.getElementById('cmdInput');
        input.value = '';
        input.focus();
        cmdSearch('');
    }, 50);
    cmdSelected = -1;
}

function closeCmdPalette(e) {
    if (!e || e.target === document.getElementById('cmdOverlay')) {
        document.getElementById('cmdOverlay').classList.remove('open');
        cmdSelected = -1;
    }
}

function highlight(text, query) {
    if (!query) return text;
    const re = new RegExp('(' + query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&') + ')', 'gi');
    return text.replace(re, '<mark>$1</mark>');
}

function cmdSearch(query) {
    const q = query.trim().toLowerCase();
    const results = document.getElementById('cmdResults');
    cmdSelected = -1;
    let html = '';

    // Lệnh điều hướng
    const navItems = CMD_NAV.filter(n => !q || n.name.toLowerCase().includes(q));
    if (navItems.length) {
        html += `<div class="cmd-group-label">⚡ Lệnh nhanh</div>`;
        navItems.forEach((item, i) => {
            html += `<div class="cmd-item" data-url="${item.url}" onclick="cmdGo('${item.url}')">
                <div class="cmd-icon nav"><i class="fa-solid ${item.icon}"></i></div>
                <div class="flex-1">
                    <div class="cmd-name">${highlight(item.name, query)}</div>
                    <div class="cmd-sub">${item.sub}</div>
                </div>
                <span class="cmd-tag">Trang</span>
            </div>`;
        });
    }

    if (q) {
        // VIP results
        const vipItems = cmdData.filter(d => d.type === 'vip' &&
            (d.name.toLowerCase().includes(q) || d.sdt.includes(q) || d.sub.toLowerCase().includes(q)));
        if (vipItems.length) {
            html += `<div class="cmd-group-label">👑 Nhân Sự VIP</div>`;
            vipItems.slice(0, 6).forEach(item => {
                html += `<div class="cmd-item" onclick="cmdScrollToVip('${item.id}')">
                    <div class="cmd-icon vip"><i class="fa-solid fa-crown"></i></div>
                    <div class="flex-1">
                        <div class="cmd-name">${highlight(item.name, query)}</div>
                        <div class="cmd-sub">${item.sub}</div>
                    </div>
                    <span class="cmd-tag">VIP</span>
                </div>`;
            });
        }

        // DN results
        const dnItems = cmdData.filter(d => d.type === 'dn' &&
            d.name.toLowerCase().includes(q));
        if (dnItems.length) {
            html += `<div class="cmd-group-label">🏢 Doanh Nghiệp</div>`;
            dnItems.slice(0, 5).forEach(item => {
                html += `<div class="cmd-item" onclick="cmdScrollToDN('${item.id}')">
                    <div class="cmd-icon dn"><i class="fa-solid fa-building"></i></div>
                    <div class="flex-1">
                        <div class="cmd-name">${highlight(item.name, query)}</div>
                        <div class="cmd-sub">${item.sub}</div>
                    </div>
                    <span class="cmd-tag">DN</span>
                </div>`;
            });
        }

        if (!navItems.length && !vipItems.length && !dnItems.length) {
            html = `<div id="cmdEmpty"><i class="fa-regular fa-face-frown-open" style="font-size:1.5rem;margin-bottom:8px;display:block;"></i>Không tìm thấy kết quả cho "<strong>${query}</strong>"</div>`;
        }
    }

    results.innerHTML = html;
}

function cmdGo(url) {
    closeCmdPalette({target: document.getElementById('cmdOverlay')});
    window.location.href = url;
}

function cmdScrollToVip(id) {
    closeCmdPalette({target: document.getElementById('cmdOverlay')});
    const row = document.getElementById('vip-view-' + id);
    if (!row) return;
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
    // Highlight dòng tìm được
    row.style.transition = 'box-shadow 0.3s ease';
    row.style.boxShadow = '0 0 0 3px rgba(212,175,55,0.6)';
    setTimeout(() => { row.style.boxShadow = ''; }, 2000);
    // Mở accordion
    setTimeout(() => openVipDetail(parseInt(id)), 400);
}

function cmdScrollToDN(id) {
    closeCmdPalette({target: document.getElementById('cmdOverlay')});
    const rows = document.querySelectorAll('.vip-company-row');
    rows.forEach(row => {
        if (String(row.dataset.customerId) === String(id)) {
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.transition = 'box-shadow 0.3s ease';
            row.style.boxShadow = '0 0 0 3px rgba(96,165,250,0.6)';
            setTimeout(() => { row.style.boxShadow = ''; }, 2000);
        }
    });
}

function cmdKeyNav(e) {
    const items = document.querySelectorAll('#cmdResults .cmd-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        cmdSelected = Math.min(cmdSelected + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cmdSelected = Math.max(cmdSelected - 1, 0);
    } else if (e.key === 'Enter' && cmdSelected >= 0) {
        e.preventDefault();
        items[cmdSelected]?.click();
        return;
    } else if (e.key === 'Escape') {
        closeCmdPalette({target: document.getElementById('cmdOverlay')});
        return;
    }

    items.forEach((item, i) => item.classList.toggle('selected', i === cmdSelected));
    if (cmdSelected >= 0) items[cmdSelected].scrollIntoView({ block: 'nearest' });
}

// Ctrl+K để mở/đóng
document.addEventListener('keydown', function(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const overlay = document.getElementById('cmdOverlay');
        if (overlay.classList.contains('open')) {
            closeCmdPalette({target: overlay});
        } else {
            openCmdPalette();
        }
    }
});

// ======== IMPORT EXCEL ========
let importModal;
document.addEventListener('DOMContentLoaded', function() {
    importModal = new bootstrap.Modal(document.getElementById('modalImport'));

    // Drag & Drop
    const dropZone = document.getElementById('dropZone');
    if (dropZone) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--primary)'; dropZone.style.background = 'rgba(140,29,64,0.04)'; });
        dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = 'var(--border)'; dropZone.style.background = 'var(--surface)'; });
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.borderColor = 'var(--border)';
            dropZone.style.background = 'var(--surface)';
            const file = e.dataTransfer.files[0];
            if (file) {
                const input = document.getElementById('importFile');
                const dt = new DataTransfer();
                dt.items.add(file);
                input.files = dt.files;
                previewImport(input);
            }
        });
    }
});

function moModalImport() {
    // Reset về bước 1
    document.getElementById('importStep1').style.display = '';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importLoading').style.display = 'none';
    document.getElementById('btnImport').style.display = 'none';
    document.getElementById('btnImportDone').style.display = 'none';
    document.getElementById('importFileName').textContent = '';
    document.getElementById('importFile').value = '';
    importModal.show();
}

function previewImport(input) {
    const file = input.files[0];
    if (!file) return;
    document.getElementById('importFileName').textContent = `📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;
    document.getElementById('btnImport').style.display = '';
}

async function thucHienImport() {
    const file = document.getElementById('importFile').files[0];
    if (!file) { alert('Vui lòng chọn file Excel!'); return; }

    // Hiện loading
    document.getElementById('importStep1').style.display = 'none';
    document.getElementById('importStep2').style.display = 'none';
    document.getElementById('importLoading').style.display = '';
    document.getElementById('btnImport').style.display = 'none';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const res  = await fetch('/import-excel', { method: 'POST', body: formData });
        const data = await res.json();

        document.getElementById('importLoading').style.display = 'none';

        if (!data.success) {
            alert('Lỗi: ' + (data.error || 'Không xác định'));
            document.getElementById('importStep1').style.display = '';
            document.getElementById('btnImport').style.display = '';
            return;
        }

        // Hiện kết quả
        document.getElementById('importCountMoi').textContent    = data.them_moi;
        document.getElementById('importCountCapNhat').textContent = data.cap_nhat;
        document.getElementById('importCountLoi').textContent    = data.loi;

        // Chi tiết từng dòng
        const tbody = document.getElementById('importDetailBody');
        tbody.innerHTML = '';
        (data.chi_tiet || []).forEach(row => {
            const color = row.trang_thai === 'Thêm mới' ? '#1a8a56'
                        : row.trang_thai === 'Cập nhật' ? '#2563EB'
                        : 'var(--primary)';
            tbody.innerHTML += `<tr>
                <td style="font-size:0.75rem;color:var(--text-light);">${row.dong}</td>
                <td style="font-size:0.75rem;font-weight:700;">${row.maKH || ''}</td>
                <td style="font-size:0.75rem;">${row.tenKH || ''}</td>
                <td>
                    <span style="font-size:0.7rem;font-weight:700;padding:2px 8px;border-radius:10px;background:${color}15;color:${color};">
                        ${row.trang_thai}${row.loi ? ' — ' + row.loi : ''}
                    </span>
                </td>
            </tr>`;
        });

        document.getElementById('importStep2').style.display = '';
        document.getElementById('btnImportDone').style.display = '';

        // Toast thông báo
        if (typeof showToast === 'function') {
            showToast(`Import xong! +${data.them_moi} mới, ~${data.cap_nhat} cập nhật, ${data.loi} lỗi`, 'success');
        }

    } catch (err) {
        document.getElementById('importLoading').style.display = 'none';
        document.getElementById('importStep1').style.display = '';
        document.getElementById('btnImport').style.display = '';
        alert('Lỗi kết nối: ' + err.message);
    }
}

// ======== DARK MODE AUTO + ĐỒNG HỒ THỰC ========
const DARK_START = 18; // 19:00
const DARK_END   = 6;  // 06:00

let manualOverride = false; // true khi user tự bấm nút

function isDarkHour(h) {
    return h >= DARK_START || h < DARK_END;
}

function applyDarkMode(dark) {
    document.body.classList.toggle('dark-mode', dark);
    const icon = document.getElementById('darkToggleIcon');
    const text = document.getElementById('darkToggleText');
    if (icon) icon.textContent = dark ? '☀️' : '🌙';
    if (text) text.textContent = dark ? 'Sáng' : 'Tối';
    localStorage.setItem('crm-dark-override', dark ? '1' : '0');
}

function toggleDarkManual() {
    manualOverride = true;
    const isDark = document.body.classList.contains('dark-mode');
    applyDarkMode(!isDark);
    // Lưu timestamp để giữ trạng thái qua các trang
    localStorage.setItem('crm-dark-manual-ts', Date.now().toString());
    setTimeout(() => {
        manualOverride = false;
        localStorage.removeItem('crm-dark-manual-ts');
    }, 2 * 60 * 60 * 1000);
}

function updateClock() {
    const now  = new Date();
    const h    = now.getHours();
    const m    = String(now.getMinutes()).padStart(2, '0');
    const s    = String(now.getSeconds()).padStart(2, '0');
    const d    = String(now.getDate()).padStart(2, '0');
    const mo   = String(now.getMonth() + 1).padStart(2, '0');
    const y    = now.getFullYear();
    const hStr = String(h).padStart(2, '0');

    const timeEl = document.getElementById('clockTime');
    const dateEl = document.getElementById('clockDate');
    if (timeEl) timeEl.textContent = `${hStr}:${m}:${s}`;
    if (dateEl) dateEl.textContent = `${d}/${mo}/${y}`;

    // Auto switch chỉ khi không có manual override
    if (!manualOverride) {
        const shouldDark = isDarkHour(h);
        const isDark = document.body.classList.contains('dark-mode');
        if (shouldDark !== isDark) applyDarkMode(shouldDark);
    }
}

// Khởi tạo khi load
(function initDarkMode() {
    const now = new Date();
    const savedTs = localStorage.getItem('crm-dark-manual-ts');
    const savedVal = localStorage.getItem('crm-dark-override');

    if (savedTs && Date.now() - parseInt(savedTs) < 2 * 60 * 60 * 1000) {
        // Còn trong thời gian override — giữ nguyên trạng thái đã chọn
        applyDarkMode(savedVal === '1');
        manualOverride = true;
        const remaining = 2 * 60 * 60 * 1000 - (Date.now() - parseInt(savedTs));
        setTimeout(() => {
            manualOverride = false;
            localStorage.removeItem('crm-dark-manual-ts');
        }, remaining);
    } else {
        // Hết override hoặc chưa có — theo giờ tự động
        localStorage.removeItem('crm-dark-manual-ts');
        applyDarkMode(isDarkHour(now.getHours()));
    }
    updateClock();
    setInterval(updateClock, 1000);
})();

