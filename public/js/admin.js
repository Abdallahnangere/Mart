import { ReceiptGenerator } from './receipt.js';

window.AdminApp = {
    state: {
        token: localStorage.getItem('admin_token'),
        currentTab: 'transactions',
        data: { transactions: [], products: [], plans: [], agents: [] }
    },

    init() {
        console.log("Admin App Initializing...");
        if (this.state.token) {
            this.showDashboard();
        } else {
            // Ensure login is visible
            document.getElementById('view-login').classList.remove('hidden');
        }
        this.bindEvents();
        if (window.lucide) window.lucide.createIcons();
    },

    bindEvents() {
        // Login
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.handleLogin();
            });
        }

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            if(confirm("Log out?")) {
                localStorage.removeItem('admin_token');
                window.location.reload();
            }
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

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const btn = document.getElementById('btn-login');
        
        // Error Box Logic
        let errorBox = document.getElementById('login-error');
        if (!errorBox) {
            errorBox = document.createElement('div');
            errorBox.id = 'login-error';
            errorBox.className = 'text-red-500 text-sm text-center mt-4 bg-red-50 p-2 rounded-lg';
            document.getElementById('login-form').appendChild(errorBox);
        }
        errorBox.innerText = '';
        errorBox.classList.add('hidden');

        // Loading State
        const originalText = btn.innerText;
        btn.innerText = 'Authenticating...';
        btn.disabled = true;

        try {
            const res = await fetch('/api/admin/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            
            const data = await res.json();

            if (res.ok) {
                this.state.token = data.token;
                localStorage.setItem('admin_token', data.token);
                this.showDashboard();
            } else {
                throw new Error(data.error || 'Authentication failed');
            }
        } catch (err) {
            console.error(err);
            errorBox.innerText = err.message;
            errorBox.classList.remove('hidden');
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    showDashboard() {
        // Forcefully hide login and show dashboard
        const loginView = document.getElementById('view-login');
        const dashView = document.getElementById('view-dashboard');
        
        if (loginView) {
            loginView.style.display = 'none'; // CSS override
            loginView.classList.add('hidden');
        }
        
        if (dashView) {
            dashView.style.display = 'flex'; // CSS override
            dashView.classList.remove('hidden');
        }

        this.switchTab('transactions');
    },

    async switchTab(tab) {
        this.state.currentTab = tab;
        
        // Update Nav UI
        document.querySelectorAll('.nav-item').forEach(el => {
            if (el.dataset.tab === tab) {
                el.classList.remove('opacity-40');
                el.classList.add('active', 'opacity-100', 'text-blue-600');
                if(el.querySelector('i')) el.querySelector('i').classList.add('text-blue-600');
            } else {
                el.classList.add('opacity-40');
                el.classList.remove('active', 'opacity-100', 'text-blue-600');
                if(el.querySelector('i')) el.querySelector('i').classList.remove('text-blue-600');
            }
        });

        // Update Title
        document.getElementById('page-title').innerText = tab.charAt(0).toUpperCase() + tab.slice(1);
        
        // Toggle FAB
        const fab = document.getElementById('fab-add');
        if (['products', 'plans'].includes(tab)) fab.classList.remove('hidden');
        else fab.classList.add('hidden');

        // Render Content Loader
        const container = document.getElementById('content-area');
        container.innerHTML = '<div class="flex justify-center p-10"><i data-lucide="loader" class="animate-spin w-8 h-8 text-neutral-300"></i></div>';
        if (window.lucide) window.lucide.createIcons();

        await this.fetchData(tab);
    },

    async fetchData(tab) {
        const container = document.getElementById('content-area');
        try {
            // Call API based on tab
            let endpoint = '';
            if (tab === 'transactions') endpoint = '/api/transactions'; // Note: You need to create this endpoint
            else if (tab === 'products') endpoint = '/api/products';
            else if (tab === 'plans') endpoint = '/api/data-plans';
            else if (tab === 'agents') endpoint = '/api/agents';

            // For now, if endpoint not created, mock it to prevent crash
            if (tab === 'transactions') {
                // Mock Transactions for now
                 this.state.data.transactions = [
                    { reference: 'MOCK-1', amount: 500000, status: 'SUCCESS', type: 'DATA', recipient: '09012345678' }
                ];
                this.renderView(tab);
                return;
            }

            const res = await fetch(endpoint);
            if (!res.ok) throw new Error("Failed to fetch data");
            
            const data = await res.json();
            this.state.data[tab] = data;
            this.renderView(tab);

        } catch (err) {
            container.innerHTML = `<div class="text-center text-red-500 py-10">Error loading data: ${err.message}</div>`;
        }
    },

    renderView(tab) {
        const container = document.getElementById('content-area');
        let html = '';

        if (tab === 'transactions') {
            const txs = this.state.data.transactions || [];
            if (txs.length === 0) html = '<div class="text-center text-neutral-400 py-10">No transactions found</div>';
            else {
                html = `<div class="space-y-4">
                    ${txs.map(tx => `
                        <div class="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex flex-col gap-3">
                            <div class="flex justify-between items-start">
                                <div>
                                    <span class="text-[10px] font-mono text-neutral-400 uppercase">${tx.reference}</span>
                                    <h3 class="font-bold text-neutral-900 mt-1">₦${(tx.amount/100).toLocaleString()}</h3>
                                    <p class="text-xs text-neutral-500">${tx.type}</p>
                                </div>
                                <span class="px-2 py-1 rounded-md text-[10px] font-bold ${tx.status === 'SUCCESS' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}">${tx.status}</span>
                            </div>
                        </div>
                    `).join('')}
                </div>`;
            }
        } 
        else if (tab === 'products') {
            const prods = this.state.data.products || [];
            html = `<div class="space-y-3">
                ${prods.map(p => `
                    <div class="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold text-neutral-900">${p.name}</h3>
                            <p class="text-xs text-neutral-500">₦${(p.priceInKobo/100).toLocaleString()}</p>
                        </div>
                        <button class="text-red-500 text-xs">Delete</button>
                    </div>
                `).join('')}
            </div>`;
        }
        else if (tab === 'plans') {
            const plans = this.state.data.plans || [];
            html = `<div class="space-y-3">
                ${plans.map(p => `
                    <div class="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex justify-between items-center">
                        <div>
                            <h3 class="font-semibold text-neutral-900">${p.planName}</h3>
                            <p class="text-xs text-neutral-500">${p.network} • ₦${(p.sellingPrice/100).toLocaleString()}</p>
                        </div>
                        <button class="text-red-500 text-xs">Delete</button>
                    </div>
                `).join('')}
            </div>`;
        }

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    },

    openAddModal(type) {
        alert("Add functionality coming next update!");
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.AdminApp.init();
});
