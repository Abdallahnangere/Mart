import { ReceiptGenerator } from './receipt.js';

window.AdminApp = {
    state: {
        token: localStorage.getItem('admin_token'),
        currentTab: 'transactions',
        data: { transactions: [], products: [], plans: [], agents: [] }
    },

    init() {
        if (this.state.token) {
            this.showDashboard();
        }
        this.bindEvents();
        if (window.lucide) window.lucide.createIcons();
    },

    bindEvents() {
        // Login
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            await this.handleLogin(email, password);
        });

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            localStorage.removeItem('admin_token');
            window.location.reload();
        });

        // Navigation
        document.querySelectorAll('.nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });

        // Floating Action Button
        document.getElementById('fab-add').addEventListener('click', () => {
            this.openAddModal(this.state.currentTab);
        });
    },

    async handleLogin(email, password) {
        const btn = document.getElementById('btn-login');
        const originalText = btn.innerText;
        btn.innerText = 'Verifying...';
        btn.disabled = true;

        try {
            // Note: Since backend auth file wasn't generated in previous step, 
            // we call the path expecting it to exist, or mock for this demo if needed.
            // Using standard fetch pattern.
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            // Fallback for demo if API doesn't exist yet
            if (res.status === 404 && email === 'aaunangere@gmail.com' && password === 'sauki009') {
                this.state.token = 'mock-jwt-token';
                localStorage.setItem('admin_token', this.state.token);
                this.showDashboard();
                return;
            }

            const data = await res.json();
            if (res.ok) {
                this.state.token = data.token;
                localStorage.setItem('admin_token', data.token);
                this.showDashboard();
            } else {
                throw new Error(data.error || 'Invalid credentials');
            }
        } catch (err) {
            alert(err.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    showDashboard() {
        document.getElementById('view-login').classList.add('hidden');
        document.getElementById('view-dashboard').classList.remove('hidden');
        this.switchTab('transactions');
    },

    async switchTab(tab) {
        this.state.currentTab = tab;
        
        // Update Nav UI
        document.querySelectorAll('.nav-item').forEach(el => {
            if (el.dataset.tab === tab) {
                el.classList.remove('opacity-40');
                el.classList.add('active', 'opacity-100', 'text-blue-600');
                el.querySelector('i').classList.add('text-blue-600');
            } else {
                el.classList.add('opacity-40');
                el.classList.remove('active', 'opacity-100', 'text-blue-600');
                el.querySelector('i').classList.remove('text-blue-600');
            }
        });

        // Update Title
        document.getElementById('page-title').innerText = tab.charAt(0).toUpperCase() + tab.slice(1);
        
        // Toggle FAB
        const fab = document.getElementById('fab-add');
        if (['products', 'plans'].includes(tab)) fab.classList.remove('hidden');
        else fab.classList.add('hidden');

        // Render Content
        const container = document.getElementById('content-area');
        container.innerHTML = '<div class="flex justify-center p-10"><i data-lucide="loader" class="animate-spin w-8 h-8 text-neutral-300"></i></div>';
        if (window.lucide) window.lucide.createIcons();

        await this.fetchData(tab);
        this.renderView(tab);
    },

    async fetchData(tab) {
        try {
            // Mocking data for UI shell since admin API endpoints weren't generated in backend step
            // In production, fetch(`/api/${tab}`)
            if (tab === 'transactions') {
                this.state.data.transactions = [
                    { id: 'tx_1', reference: 'REF-12345', amount: 100000, status: 'SUCCESS', type: 'DATA', recipient: '09012345678', date: new Date().toISOString() },
                    { id: 'tx_2', reference: 'REF-67890', amount: 5000000, status: 'PENDING', type: 'DEVICE', recipient: '08099887766', date: new Date().toISOString() },
                    { id: 'tx_3', reference: 'REF-FAIL1', amount: 200000, status: 'FAILED', type: 'DATA', recipient: '07011223344', date: new Date().toISOString() }
                ];
            } else if (tab === 'agents') {
                this.state.data.agents = [
                    { id: 'ag_1', name: 'John Doe', phone: '08011112222', status: 'PENDING' }
                ];
            }
            // For products/plans, assume empty or pre-filled
        } catch (err) {
            console.error('Fetch error', err);
        }
    },

    renderView(tab) {
        const container = document.getElementById('content-area');
        let html = '';

        if (tab === 'transactions') {
            html = `<div class="space-y-4">
                <div class="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
                    <button class="bg-neutral-900 text-white px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap">All</button>
                    <button class="bg-white border border-neutral-200 text-neutral-600 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap">Pending</button>
                    <button class="bg-white border border-neutral-200 text-neutral-600 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap">Failed</button>
                    <button onclick="AdminApp.exportCSV()" class="ml-auto bg-green-50 text-green-700 px-4 py-2 rounded-xl text-xs font-medium whitespace-nowrap flex items-center gap-1"><i data-lucide="download" class="w-3 h-3"></i> CSV</button>
                </div>
                ${this.state.data.transactions.map(tx => `
                    <div class="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex flex-col gap-3 animate-fade-in">
                        <div class="flex justify-between items-start">
                            <div>
                                <span class="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">${tx.reference}</span>
                                <h3 class="font-bold text-neutral-900 mt-1">₦${(tx.amount/100).toLocaleString()}</h3>
                                <p class="text-xs text-neutral-500">${tx.type} • ${tx.recipient}</p>
                            </div>
                            <span class="px-2 py-1 rounded-md text-[10px] font-bold ${tx.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : tx.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}">${tx.status}</span>
                        </div>
                        <div class="flex gap-2 border-t border-neutral-50 pt-3">
                            ${tx.status === 'FAILED' ? `<button onclick="AdminApp.retryTx('${tx.reference}')" class="flex-1 bg-neutral-900 text-white text-xs font-medium py-2 rounded-lg">Retry Delivery</button>` : ''}
                            <button onclick='AdminApp.generateReceipt(${JSON.stringify(tx).replace(/'/g, "")})' class="flex-1 bg-neutral-50 hover:bg-neutral-100 text-neutral-600 text-xs font-medium py-2 rounded-lg">Receipt</button>
                        </div>
                    </div>
                `).join('')}
            </div>`;
        } else if (tab === 'agents') {
            html = `<div class="space-y-3">
                ${this.state.data.agents.length === 0 ? '<p class="text-center text-neutral-400 py-10">No pending agents</p>' : ''}
                ${this.state.data.agents.map(ag => `
                    <div class="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex items-center justify-between animate-fade-in">
                        <div>
                            <h3 class="font-semibold text-neutral-900">${ag.name}</h3>
                            <p class="text-xs text-neutral-500">${ag.phone}</p>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="AdminApp.approveAgent('${ag.id}', false)" class="p-2 bg-red-50 text-red-600 rounded-full"><i data-lucide="x" class="w-4 h-4"></i></button>
                            <button onclick="AdminApp.approveAgent('${ag.id}', true)" class="p-2 bg-green-50 text-green-600 rounded-full"><i data-lucide="check" class="w-4 h-4"></i></button>
                        </div>
                    </div>
                `).join('')}
            </div>`;
        } else {
            html = `<div class="text-center text-neutral-400 py-20 text-sm">Content management for ${tab} coming soon.</div>`;
        }

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    },

    // ACTIONS
    async retryTx(ref) {
        if (!confirm('Retry delivery for this transaction?')) return;
        // Call logic reusing deliver-data endpoint
        // For MVP, we assume the frontend handles the retry trigger to backend
        alert(`Retrying delivery for ${ref}...`);
    },

    generateReceipt(tx) {
        ReceiptGenerator.generate({
            transaction_reference: tx.reference,
            amount_kobo: tx.amount,
            status: tx.status,
            purpose: tx.type,
            date: tx.date,
            recipient: tx.recipient
        });
    },

    async approveAgent(id, isApproved) {
        if (!confirm(isApproved ? 'Approve Agent?' : 'Reject Agent?')) return;
        // Fetch API
        const div = event.target.closest('.bg-white');
        div.style.opacity = '0.5';
        setTimeout(() => div.remove(), 500);
    },

    exportCSV() {
        const rows = [
            ['Reference', 'Amount', 'Status', 'Date', 'Recipient'],
            ...this.state.data.transactions.map(t => [t.reference, t.amount, t.status, t.date, t.recipient])
        ];
        const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "transactions.csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
    },

    // Modal Logic
    openAddModal(type) {
        const modal = document.getElementById('modal-overlay');
        const title = document.getElementById('modal-title');
        const body = document.getElementById('modal-body');
        
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        title.innerText = `Add New ${type.slice(0, -1)}`; // Remove 's'

        if (type === 'products') {
            body.innerHTML = `
                <input type="text" placeholder="Product Name" class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <input type="number" placeholder="Price (Naira)" class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <textarea placeholder="Description" class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200"></textarea>
            `;
        } else if (type === 'plans') {
            body.innerHTML = `
                <select class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                    <option>MTN</option> <option>GLO</option> <option>AIRTEL</option>
                </select>
                <input type="text" placeholder="Plan Name (e.g. 1GB SME)" class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <input type="number" placeholder="Cost Price" class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                <input type="text" placeholder="Amigo Plan ID" class="w-full bg-neutral-50 p-3 rounded-xl border border-neutral-200">
            `;
        }
    },

    closeModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        document.getElementById('modal-overlay').classList.remove('flex');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.AdminApp.init();
});
