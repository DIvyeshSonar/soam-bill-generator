// State management
let currentInvoice = {
    id: Date.now(),
    invoiceNo: "",
    date: new Date().toISOString().split('T')[0],
    customerName: "",
    customerEmail: "",
    items: [],
    subtotal: 0,
    cgstRate: 9,
    sgstRate: 9,
    cgst: 0,
    sgst: 0,
    total: 0,
    received: 0,
    prevBalance: 0,
    terms: "Thank you for doing business with us."
};

let invoiceHistory = JSON.parse(localStorage.getItem('invoiceHistory')) || [];
let companySettings = JSON.parse(localStorage.getItem('companySettings')) || {
    name: "life energy",
    email: "lifeenergy@gmail.com",
    mobile: "+91 98765 43210",
    signature: "signature.png"
};
const syncKey = 'soam-owner';

const API_ENDPOINTS = {
    invoices: '/api/invoices',
    settings: '/api/settings'
};

async function apiRequest(endpoint, method = 'GET', data = null) {
    if (!syncKey) return null;
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'x-sync-key': syncKey
            }
        };
        if (data) options.body = JSON.stringify(data);
        const response = await fetch(endpoint, options);
        if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
        return await response.json();
    } catch (err) {
        console.error('Cloud Sync Error:', err);
        updateSyncStatus(false);
        return null;
    }
}

function updateSyncStatus(isOnline) {
    const statusEl = document.getElementById('sync-status');
    if (!statusEl) return;
    if (syncKey && isOnline) {
        statusEl.textContent = 'Synced';
        statusEl.className = 'sync-status online';
    } else {
        statusEl.textContent = syncKey ? 'Error' : 'Offline';
        statusEl.className = 'sync-status offline';
    }
}

// DOM Elements (will be initialized in initApp)
let itemsContainer, addItemBtn, invoicePreview, historyList, saveBtn, printBtn, newBtn, getStartedBtn, landingPage;

// Initial setup
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function initApp() {
    // Initialize DOM Elements
    itemsContainer = document.getElementById('items-container');
    addItemBtn = document.getElementById('add-item-btn');
    invoicePreview = document.getElementById('invoice-preview');
    historyList = document.getElementById('invoice-history');
    saveBtn = document.getElementById('save-invoice-btn');
    printBtn = document.getElementById('print-bill-btn');
    newBtn = document.getElementById('new-invoice-btn');
    getStartedBtn = document.getElementById('get-started-btn');
    landingPage = document.getElementById('landing-page');

    // Set company settings
    document.getElementById('comp-name').value = companySettings.name;
    document.getElementById('comp-email').value = companySettings.email;
    document.getElementById('comp-mobile').value = companySettings.mobile || '';

    // Ensure signature is set to permanent path if none exists
    if (!companySettings.signature) {
        companySettings.signature = "signature.png";
        localStorage.setItem('companySettings', JSON.stringify(companySettings));
    }

    // Generate Invoice No
    const lastNo = invoiceHistory.length > 0 ? Math.max(...invoiceHistory.map(inv => parseInt(inv.invoiceNo) || 0)) : 1851;
    currentInvoice.invoiceNo = lastNo + 1;
    document.getElementById('invoice-no').value = currentInvoice.invoiceNo;

    // Add first empty row
    addItemRow();

    // Render initial history
    renderHistory();


    // Initial Sync
    if (syncKey) {
        syncAll();
    }

    // Bind Event Listeners
    setupEventListeners();

    // Initial preview refresh & scale
    updatePreview();
    updatePreviewScale();
}

async function syncAll() {
    updateSyncStatus(false);
    
    // 1. Sync Settings
    const cloudSettings = await apiRequest(API_ENDPOINTS.settings, 'GET');
    if (cloudSettings) {
        companySettings = { ...companySettings, ...cloudSettings };
        localStorage.setItem('companySettings', JSON.stringify(companySettings));
        // Update UI
        document.getElementById('comp-name').value = companySettings.name;
        document.getElementById('comp-email').value = companySettings.email;
        document.getElementById('comp-mobile').value = companySettings.mobile || '';
    } else if (syncKey) {
        // Push local settings to cloud if not exists
        await apiRequest(API_ENDPOINTS.settings, 'POST', companySettings);
    }

    // 2. Sync Invoices
    const cloudInvoices = await apiRequest(API_ENDPOINTS.invoices, 'GET');
    if (cloudInvoices) {
        const cloudIds = new Set(cloudInvoices.map(inv => inv.id));
        const newLocalHistory = [];

        // Identify what to keep from local history
        for (const localInv of invoiceHistory) {
            const existsInCloud = cloudIds.has(localInv.id);

            if (localInv.synced && !existsInCloud) {
                // If marks as synced but missing from cloud, it was deleted elsewhere.
                // SKIP/REMOVE this from local history.
                continue;
            }

            if (!localInv.synced && !existsInCloud) {
                // If NOT synced and missing from cloud, it's a new offline bill.
                // PUSH to cloud.
                await apiRequest(API_ENDPOINTS.invoices, 'POST', localInv);
                localInv.synced = true;
            }

            newLocalHistory.push(localInv);
        }

        // Add/Update from cloud invoices
        cloudInvoices.forEach(cloudInv => {
            const localIdx = newLocalHistory.findIndex(inv => inv.id === cloudInv.id);
            const cloudInvWithFlag = { ...cloudInv, synced: true };
            if (localIdx > -1) {
                newLocalHistory[localIdx] = cloudInvWithFlag;
            } else {
                newLocalHistory.push(cloudInvWithFlag);
            }
        });

        invoiceHistory = newLocalHistory;
        invoiceHistory.sort((a, b) => b.id - a.id);
        localStorage.setItem('invoiceHistory', JSON.stringify(invoiceHistory));
        renderHistory();
        updateSyncStatus(true);
    }
}

function setupEventListeners() {
    addItemBtn.addEventListener('click', () => addItemRow());

    // Manual GST Rate Listeners
    document.getElementById('cgst-rate').addEventListener('input', (e) => {
        currentInvoice.cgstRate = parseFloat(e.target.value) || 0;
        updatePreview();
    });
    document.getElementById('sgst-rate').addEventListener('input', (e) => {
        currentInvoice.sgstRate = parseFloat(e.target.value) || 0;
        updatePreview();
    });

    // Global delegation for item inputs
    itemsContainer.addEventListener('input', (e) => {
        if (e.target.tagName === 'INPUT') {
            updatePreview();
        }
    });

    // Customer detail listeners
    ['customer-name', 'customer-email', 'invoice-no', 'invoice-date', 'invoice-terms', 'received-amount', 'prev-balance'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener('input', (e) => {
            let key = id.replace('invoice-', '').replace('-amount', '').replace('prev-', 'prev');
            if (id === 'customer-name') key = 'customerName';
            if (id === 'customer-email') key = 'customerEmail';
            if (id === 'invoice-no') key = 'invoiceNo';
            if (id === 'received-amount') key = 'received';
            if (id === 'prev-balance') key = 'prevBalance';

            const val = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
            currentInvoice[key] = val;
            updatePreview(); // Re-calc balance
        });
    });

    // Company detail listeners
    document.getElementById('comp-name').addEventListener('input', (e) => {
        companySettings.name = e.target.value;
        localStorage.setItem('companySettings', JSON.stringify(companySettings));
        updatePreview();
        if (syncKey) apiRequest(API_ENDPOINTS.settings, 'POST', companySettings);
    });
    document.getElementById('comp-email').addEventListener('input', (e) => {
        companySettings.email = e.target.value;
        localStorage.setItem('companySettings', JSON.stringify(companySettings));
        updatePreview();
        if (syncKey) apiRequest(API_ENDPOINTS.settings, 'POST', companySettings);
    });
    document.getElementById('comp-mobile').addEventListener('input', async (e) => {
        companySettings.mobile = e.target.value;
        localStorage.setItem('companySettings', JSON.stringify(companySettings));
        updatePreview();
        if (syncKey) apiRequest(API_ENDPOINTS.settings, 'POST', companySettings);
    });


    saveBtn.addEventListener('click', saveInvoice);
    printBtn.addEventListener('click', () => {
        const originalTitle = document.title;
        const customerName = currentInvoice.customerName ? currentInvoice.customerName.replace(/[^a-z0-9]/gi, '_') : 'Customer';
        document.title = `Invoice_${currentInvoice.invoiceNo}_${customerName}_Soam_Lights`;
        window.print();
        document.title = originalTitle;
    });
    newBtn.addEventListener('click', resetForm);

    if (getStartedBtn && landingPage) {
        getStartedBtn.addEventListener('click', () => {
            landingPage.classList.add('hidden');
        });
    }

    // Scaling listener
    window.addEventListener('resize', updatePreviewScale);

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const closeSidebarBtn = document.getElementById('close-sidebar-btn');
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    const toggleSidebar = () => {
        sidebar.classList.toggle('active');
        backdrop.classList.toggle('active');
    };

    if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', toggleSidebar);
    if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', toggleSidebar);
    if (backdrop) backdrop.addEventListener('click', toggleSidebar);

    // Desktop Sidebar Toggle
    const toggleSidebarBtn = document.getElementById('toggle-sidebar-btn');
    const appContainer = document.querySelector('.app-container');

    if (toggleSidebarBtn) {
        toggleSidebarBtn.addEventListener('click', () => {
            appContainer.classList.toggle('sidebar-collapsed');
            // Update icons if necessary
            setTimeout(updatePreviewScale, 400); // Re-scale preview after sidebar animation
        });
    }

    // Tab Switching Logic
    const tabHistory = document.getElementById('tab-history');
    const tabSettings = document.getElementById('tab-settings');
    const sectionHistory = document.getElementById('section-history');
    const sectionSettings = document.getElementById('section-settings');

    const switchTab = (tabName) => {
        if (tabName === 'history') {
            tabHistory.classList.add('active');
            tabSettings.classList.remove('active');
            sectionHistory.classList.remove('hidden');
            sectionSettings.classList.add('hidden');
        } else {
            tabHistory.classList.remove('active');
            tabSettings.classList.add('active');
            sectionHistory.classList.add('hidden');
            sectionSettings.classList.remove('hidden');
        }
    };

    if (tabHistory) tabHistory.addEventListener('click', () => switchTab('history'));
    if (tabSettings) tabSettings.addEventListener('click', () => switchTab('settings'));

    // Close sidebar on item selection (for history)
    historyList.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (e.target.closest('.history-item')) {
                toggleSidebar();
            }
        }
    });
}

function addItemRow(itemData = null) {
    const container = document.getElementById('items-container');
    if (!container) return;

    const itemCount = container.children.length + 1;
    const card = document.createElement('div');
    card.className = 'item-entry-card';
    card.innerHTML = `
        <div class="item-row-top">
            <div class="item-index">${itemCount}</div>
            <div class="input-label-group">
                <input type="text" class="item-name" placeholder="What are you selling? (Item Name)" oninput="updatePreview()">
            </div>
            <button class="delete-item-btn" onclick="removeItem(this)">
                <i data-lucide="trash-2" style="width: 18px;"></i>
            </button>
        </div>
        <div class="item-row-bottom">
            <div class="input-label-group">
                <label>HSN/SAC</label>
                <input type="text" class="item-hsn" placeholder="Code" oninput="updatePreview()">
            </div>
            <div class="input-label-group">
                <label>Qty</label>
                <input type="number" class="item-qty" value="1" oninput="updatePreview()">
            </div>
            <div class="input-label-group">
                <label>Unit</label>
                <input type="text" class="item-unit" value="Pcs" oninput="updatePreview()">
            </div>
            <div class="input-label-group">
                <label>Price (₹)</label>
                <input type="number" class="item-price" value="0.00" step="0.01" oninput="updatePreview()">
            </div>
            <div class="input-label-group" style="text-align: right;">
                <label>Amount</label>
                <div class="item-amount-display">₹ ${(itemData ? itemData.amount : 0).toFixed(2)}</div>
            </div>
        </div>
    `;

    if (itemData) {
        card.querySelector('.item-name').value = itemData.name || '';
        card.querySelector('.item-hsn').value = itemData.hsn || '';
        card.querySelector('.item-qty').value = itemData.qty || 1;
        card.querySelector('.item-unit').value = itemData.unit || 'Pcs';
        card.querySelector('.item-price').value = itemData.price || 0;
    }

    container.appendChild(card);
    lucide.createIcons();
    updatePreview();
}

function removeItem(btn) {
    btn.closest('.item-entry-card').remove();
    reindexItems();
    updatePreview();
}

function reindexItems() {
    const cards = document.querySelectorAll('.item-entry-card');
    cards.forEach((card, idx) => {
        card.querySelector('.item-index').textContent = idx + 1;
    });
}

function formatCurrency(num) {
    return '₹ ' + (num || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updatePreview() {
    const items = [];
    const itemCards = document.querySelectorAll('.item-entry-card');

    itemCards.forEach(card => {
        const name = card.querySelector('.item-name').value;
        const hsn = card.querySelector('.item-hsn').value;
        const qty = parseFloat(card.querySelector('.item-qty').value) || 0;
        const unit = card.querySelector('.item-unit').value;
        const price = parseFloat(card.querySelector('.item-price').value) || 0;
        const amount = qty * price;

        card.querySelector('.item-amount-display').textContent = formatCurrency(amount);

        if (name || price) {
            items.push({ name, hsn, qty, unit, price, amount });
        }
    });

    const subtotal = items.reduce((sum, item) => sum + item.amount, 0);
    const cgst = subtotal * (currentInvoice.cgstRate / 100);
    const sgst = subtotal * (currentInvoice.sgstRate / 100);
    const total = subtotal + cgst + sgst;
    const balance = total - (currentInvoice.received || 0);
    const currentBalance = balance + (currentInvoice.prevBalance || 0);

    currentInvoice.subtotal = subtotal;
    currentInvoice.cgst = cgst;
    currentInvoice.sgst = sgst;
    currentInvoice.total = total;
    currentInvoice.balance = balance;
    currentInvoice.currentBalance = currentBalance;
    currentInvoice.items = items;

    // Update left-side UI summary
    document.getElementById('calc-subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('calc-cgst').textContent = formatCurrency(cgst);
    document.getElementById('calc-sgst').textContent = formatCurrency(sgst);
    document.getElementById('calc-total').textContent = formatCurrency(total);

    renderPreview(currentInvoice);
}

function renderPreview(data) {
    const preview = document.getElementById('invoice-preview');
    const { invoiceNo, date, customerName, customerEmail, items, subtotal, cgst, sgst, total, terms } = data;

    // Smart Spacing: Apply compact mode if items are many (e.g., > 10)
    if (items.length > 10) {
        preview.classList.add('compact-mode');
    } else {
        preview.classList.remove('compact-mode');
    }

    preview.innerHTML = `
        <div class="preview-header">
            <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 8px;">
                <div>
                    <h2 style="font-size: 28px; font-weight: 800; color: #000; font-family: 'Inter'; margin-bottom: 2px;">${companySettings.name}</h2>
                    <p style="color: #000; font-size: 14px; font-weight: 600;">Email: <span style="font-weight: 500;">${companySettings.email}</span></p>
                    <p style="color: #000; font-size: 14px; font-weight: 600;">Mobile: <span style="font-weight: 500;">${companySettings.mobile || ''}</span></p>
                </div>
                <div style="text-align: right;">
                    <h1 style="color: var(--primary); margin: 0; font-family: 'Inter'; font-size: 32px; font-weight: 800; text-transform: uppercase;">Tax Invoice</h1>
                </div>
            </div>
            <div style="border-bottom: 3px solid var(--primary); margin-bottom: 24px;"></div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
            <div>
                <h4 style="margin-bottom: 8px;">Bill To</h4>
                <p style="font-weight: 700; font-size: 18px;">${customerName || 'Customer Name'}</p>
                <p style="color: #636e72;">${customerEmail || ''}</p>
            </div>
            <div style="text-align: right;">
                <h4 style="margin-bottom: 8px;">Invoice Details</h4>
                <p><strong>Invoice No.:</strong> ${invoiceNo}</p>
                <p><strong>Date:</strong> ${formatDate(date)}</p>
            </div>
        </div>

        <div id="preview-table-container" style="margin-bottom: 30px;">
            <table class="preview-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">No</th>
                        <th>Item name</th>
                        <th>HSN/ SAC</th>
                        <th style="text-align: right; width: 80px;">Qty</th>
                        <th style="text-align: center; width: 60px;">Unit</th>
                        <th style="text-align: right; width: 120px;">Price/ unit</th>
                        <th style="text-align: right; width: 120px;">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${items.length > 0 ? items.map((item, idx) => `
                        <tr>
                            <td>${idx + 1}</td>
                            <td style="font-weight: 500;">${item.name}</td>
                            <td>${item.hsn}</td>
                            <td style="text-align: right;">${item.qty}</td>
                            <td style="text-align: center;">${item.unit}</td>
                            <td style="text-align: right;">${formatCurrency(item.price)}</td>
                            <td style="text-align: right; font-weight: 600;">${formatCurrency(item.amount)}</td>
                        </tr>
                    `).join('') : '<tr><td colspan="7" style="text-align:center; color:#ccc;">No items added</td></tr>'}
                </tbody>
            </table>
        </div>

        <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: 40px; margin-top: 40px;">
            <div>
                <div style="margin-bottom: 24px;">
                    <h4 style="margin-bottom: 8px;">Invoice Amount In Words</h4>
                    <p style="font-weight: 500; text-transform: capitalize;">${numberToWords(total)} Rupees Only</p>
                </div>
                <div>
                    <h4 style="margin-bottom: 8px;">Terms And Conditions</h4>
                    <p style="color: #636e72; font-size: 14px;">${terms}</p>
                </div>
            </div>
            <div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <span>Sub Total</span>
                        <span>${formatCurrency(subtotal)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>CGST (${currentInvoice.cgstRate}%)</span>
                        <span>${formatCurrency(cgst)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>SGST (${currentInvoice.sgstRate}%)</span>
                        <span>${formatCurrency(sgst)}</span>
                    </div>
                    <div class="preview-total-row" style="display: flex; justify-content: space-between;">
                        <span>Total</span>
                        <span>${formatCurrency(total)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                        <span>Received</span>
                        <span>${formatCurrency(currentInvoice.received)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                        <span>Balance</span>
                        <span>${formatCurrency(currentInvoice.balance)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px;">
                        <span>Previous Balance</span>
                        <span>${formatCurrency(currentInvoice.prevBalance)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid #eee; padding-bottom: 8px; font-weight: 700;">
                        <span>Current Balance</span>
                        <span>${formatCurrency(currentInvoice.currentBalance)}</span>
                    </div>
                </div>
                <div style="margin-top: 40px; text-align: center;">
                    <p style="font-weight: 700; margin-bottom: 5px;">For: ${companySettings.name}</p>
                    <div style="height: 60px; display: flex; align-items: center; justify-content: center; margin-bottom: 5px;">
                        ${companySettings.signature ? `<img src="${companySettings.signature}" style="max-height: 100%; max-width: 250px; object-fit: contain;">` : ''}
                    </div>
                    <div style="width: 180px; border-top: 2px solid #333; margin: 0 auto;"></div>
                    <p style="font-size: 14px; font-weight: 600;">Authorized Signatory</p>
                </div>
            </div>
        </div>
    `;

    // Always re-calculate scale after content changes
    setTimeout(updatePreviewScale, 0);
}

function updatePreviewScale() {
    const wrapper = document.getElementById('preview-wrapper');
    const container = document.querySelector('.preview-section');
    if (!wrapper || !container) return;

    const paperWidth = 793.7; // Approx width of 210mm at 96 DPI
    const containerWidth = container.offsetWidth - 48; // Subtract padding
    const containerHeight = container.offsetHeight - 48;

    // We scale based on width primarily to ensure horizontal fit
    const scale = Math.min(containerWidth / paperWidth, 1);

    wrapper.style.transform = `scale(${scale})`;

    // Center the scaled element vertically if needed
    const scaledHeight = 1122.5 * scale; // 297mm at 96 DPI
    if (scaledHeight < containerHeight) {
        wrapper.style.marginTop = `${(containerHeight - scaledHeight) / 2}px`;
    } else {
        wrapper.style.marginTop = '0';
    }
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
}

function saveInvoice() {
    const existingIndex = invoiceHistory.findIndex(inv => inv.id === currentInvoice.id);

    if (existingIndex > -1) {
        invoiceHistory[existingIndex] = { ...currentInvoice };
    } else {
        invoiceHistory.unshift({ ...currentInvoice });
    }

    // Increased Limit to 100
    if (invoiceHistory.length > 100) {
        invoiceHistory = invoiceHistory.slice(0, 100);
    }

    localStorage.setItem('invoiceHistory', JSON.stringify(invoiceHistory));
    renderHistory();
    
    if (syncKey) {
        updateSyncStatus(false);
        apiRequest(API_ENDPOINTS.invoices, 'POST', currentInvoice).then(res => {
            if (res) {
                updateSyncStatus(true);
                // Mark as synced locally
                const invIdx = invoiceHistory.findIndex(inv => inv.id === currentInvoice.id);
                if (invIdx > -1) {
                    invoiceHistory[invIdx].synced = true;
                    localStorage.setItem('invoiceHistory', JSON.stringify(invoiceHistory));
                }
            }
        });
    }
    
    alert('Invoice saved ' + (syncKey ? 'to Cloud!' : 'locally!'));
}

function renderHistory() {
    if (invoiceHistory.length === 0) {
        historyList.innerHTML = '<p class="empty-msg">No invoices saved yet.</p>';
        return;
    }

    historyList.innerHTML = invoiceHistory.map(inv => `
        <div class="history-item" onclick="loadInvoice(${inv.id})">
            <div style="flex: 1; overflow: hidden;">
                <div class="inv-no">#${inv.invoiceNo}</div>
                <div class="inv-customer">${inv.customerName || 'Walking Customer'}</div>
                <div class="inv-meta">${formatDate(inv.date)} • ${formatCurrency(inv.total)}</div>
            </div>
            <button class="delete-inv-btn" onclick="event.stopPropagation(); deleteInvoice(${inv.id})">
                <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
            </button>
        </div>
    `).join('');

    lucide.createIcons();
}

function deleteInvoice(id) {
    if (confirm('Are you sure you want to delete this invoice?')) {
        invoiceHistory = invoiceHistory.filter(inv => inv.id !== id);
        localStorage.setItem('invoiceHistory', JSON.stringify(invoiceHistory));
        renderHistory();
        
        if (syncKey) {
            apiRequest(`${API_ENDPOINTS.invoices}?id=${id}`, 'DELETE').then(res => {
                if (res) updateSyncStatus(true);
            });
        }

        if (currentInvoice.id === id) {
            resetForm();
        }
    }
}

function loadInvoice(id) {
    const inv = invoiceHistory.find(i => i.id === id);
    if (!inv) return;

    currentInvoice = { ...inv };

    document.getElementById('customer-name').value = inv.customerName;
    document.getElementById('customer-email').value = inv.customerEmail || '';
    document.getElementById('invoice-no').value = inv.invoiceNo;
    document.getElementById('invoice-date').value = inv.date;
    document.getElementById('invoice-terms').value = inv.terms;
    document.getElementById('received-amount').value = inv.received || 0;
    document.getElementById('prev-balance').value = inv.prevBalance || 0;
    document.getElementById('cgst-rate').value = inv.cgstRate || 9;
    document.getElementById('sgst-rate').value = inv.sgstRate || 9;

    itemsContainer.innerHTML = '';
    if (inv.items && inv.items.length > 0) {
        inv.items.forEach(item => addItemRow(item));
    } else {
        addItemRow();
    }

    updatePreview();
}

function resetForm() {
    currentInvoice = {
        id: Date.now(),
        invoiceNo: (parseInt(invoiceHistory[0]?.invoiceNo) || 1851) + 1,
        date: new Date().toISOString().split('T')[0],
        customerName: "",
        customerEmail: "",
        items: [],
        subtotal: 0,
        cgstRate: 9,
        sgstRate: 9,
        cgst: 0,
        sgst: 0,
        total: 0,
        received: 0,
        prevBalance: 0,
        terms: "Thank you for doing business with us."
    };

    document.getElementById('customer-name').value = '';
    document.getElementById('customer-email').value = '';
    document.getElementById('invoice-no').value = currentInvoice.invoiceNo;
    document.getElementById('invoice-date').value = currentInvoice.date;
    document.getElementById('invoice-terms').value = currentInvoice.terms;
    document.getElementById('received-amount').value = 0;
    document.getElementById('prev-balance').value = 0;
    document.getElementById('cgst-rate').value = 9;
    document.getElementById('sgst-rate').value = 9;

    itemsContainer.innerHTML = '';
    addItemRow();
    updatePreview();
}

function numberToWords(number) {
    const a = ['', 'one ', 'two ', 'three ', 'four ', 'five ', 'six ', 'seven ', 'eight ', 'nine ', 'ten ', 'eleven ', 'twelve ', 'thirteen ', 'fourteen ', 'fifteen ', 'sixteen ', 'seventeen ', 'eighteen ', 'nineteen '];
    const b = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    function inWords(num) {
        if ((num = num.toString()).length > 9) return 'overflow';
        let n = ('000000000' + num).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
        if (!n) return '';
        let str = '';
        str += (n[1] != 0) ? (a[Number(n[1])] || b[n[1][0]] + ' ' + a[n[1][1]]) + 'crore ' : '';
        str += (n[2] != 0) ? (a[Number(n[2])] || b[n[2][0]] + ' ' + a[n[2][1]]) + 'lakh ' : '';
        str += (n[3] != 0) ? (a[Number(n[3])] || b[n[3][0]] + ' ' + a[n[3][1]]) + 'thousand ' : '';
        str += (n[4] != 0) ? (a[Number(n[4])] || b[n[4][0]] + ' ' + a[n[4][1]]) + 'hundred ' : '';
        str += (n[5] != 0) ? ((str != '') ? 'and ' : '') + (a[Number(n[5])] || b[n[5][0]] + ' ' + a[n[5][1]]) : '';
        return str;
    }

    return inWords(Math.floor(number));
}
