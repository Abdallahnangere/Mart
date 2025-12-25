/**
 * SAUKI MART PAYMENT SYSTEM
 * Handles the full lifecycle of Flutterwave Virtual Account payments.
 * - Creates virtual account
 * - Displays standardized Apple-style UI overlay
 * - Handles verification and retries
 * - robust error handling
 */

export const PaymentSystem = {
    config: {
        overlayId: 'sm-payment-overlay',
        apiCreate: '/api/create-virtual-account',
        apiVerify: '/api/verify-payment'
    },

    state: {
        txRef: null,
        onSuccess: null,
        payload: null,
        isVerifying: false
    },

    /**
     * Entry Point
     * @param {Object} payload - { name, phone, amount_kobo, purpose }
     * @param {Function} onSuccessCallback - Function to call after successful verification
     */
    async start(payload, onSuccessCallback) {
        this.state.payload = payload;
        this.state.onSuccess = onSuccessCallback;
        this.state.txRef = null;

        // 1. Inject UI if not present
        this._ensureDom();
        
        // 2. Show Loader
        this._showModal();
        this._renderLoading("Generating secure account...");

        try {
            // 3. Create Account
            const data = await this._createAccount(payload);
            this.state.txRef = data.transaction_reference;

            // 4. Show Account Details
            this._renderAccountDetails(data);
        } catch (error) {
            this._renderError(error.message);
        }
    },

    async _createAccount(payload) {
        const res = await fetch(this.config.apiCreate, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to create account');
        return data;
    },

    async _verifyTransaction() {
        if (this.state.isVerifying) return;
        this.state.isVerifying = true;
        
        const btn = document.getElementById('sm-verify-btn');
        const originalText = btn.innerText;
        btn.innerHTML = `<span class="animate-pulse">Checking network...</span>`;
        btn.disabled = true;

        try {
            const res = await fetch(this.config.apiVerify, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_reference: this.state.txRef })
            });
            const data = await res.json();

            if (data.status === 'SUCCESS') {
                this._renderSuccess();
                setTimeout(() => {
                    this._closeModal();
                    if (this.state.onSuccess) this.state.onSuccess(data);
                }, 2000);
            } else {
                this._toast("Payment not confirmed yet. Please try again.");
                btn.innerText = "Check Again";
                btn.disabled = false;
            }
        } catch (error) {
            this._toast("Verification error. Check internet.");
            btn.innerText = "Check Again";
            btn.disabled = false;
        } finally {
            this.state.isVerifying = false;
        }
    },

    // --- UI RENDERING LOGIC ---

    _ensureDom() {
        if (document.getElementById(this.config.overlayId)) return;

        const overlay = document.createElement('div');
        overlay.id = this.config.overlayId;
        overlay.className = "fixed inset-0 z-[100] flex items-end sm:items-center justify-center pointer-events-none opacity-0 transition-opacity duration-300";
        overlay.innerHTML = `
            <div class="absolute inset-0 bg-neutral-900/40 backdrop-blur-md transition-opacity" onclick="PaymentSystem._confirmClose()"></div>
            <div id="sm-modal-card" class="bg-white w-full max-w-md m-0 sm:m-4 rounded-t-3xl sm:rounded-3xl shadow-2xl transform translate-y-full sm:translate-y-10 transition-transform duration-300 pointer-events-auto overflow-hidden">
                <div id="sm-modal-content" class="p-8"></div>
            </div>
            <div id="sm-toast" class="absolute top-10 left-1/2 -translate-x-1/2 bg-neutral-800 text-white text-xs py-2 px-4 rounded-full opacity-0 transition-opacity pointer-events-none"></div>
        `;
        document.body.appendChild(overlay);
        
        // Expose global closer for the backdrop click
        window.PaymentSystem = this;
    },

    _showModal() {
        const overlay = document.getElementById(this.config.overlayId);
        const card = document.getElementById('sm-modal-card');
        
        overlay.classList.remove('opacity-0', 'pointer-events-none');
        setTimeout(() => {
            card.classList.remove('translate-y-full', 'sm:translate-y-10');
            card.classList.add('translate-y-0');
        }, 10);
    },

    _closeModal() {
        const overlay = document.getElementById(this.config.overlayId);
        const card = document.getElementById('sm-modal-card');

        card.classList.add('translate-y-full', 'sm:translate-y-10');
        card.classList.remove('translate-y-0');
        
        setTimeout(() => {
            overlay.classList.add('opacity-0', 'pointer-events-none');
        }, 300);
    },

    _confirmClose() {
        if (confirm("Cancel transaction?")) {
            this._closeModal();
        }
    },

    _toast(msg) {
        const t = document.getElementById('sm-toast');
        t.innerText = msg;
        t.classList.remove('opacity-0');
        setTimeout(() => t.classList.add('opacity-0'), 3000);
    },

    _renderLoading(text) {
        const container = document.getElementById('sm-modal-content');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10 space-y-4">
                <div class="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                <p class="text-sm font-medium text-neutral-500 animate-pulse">${text}</p>
            </div>
        `;
    },

    _renderAccountDetails(data) {
        const container = document.getElementById('sm-modal-content');
        container.innerHTML = `
            <div class="text-center mb-6">
                <div class="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                    <i data-lucide="wallet" class="w-6 h-6"></i>
                </div>
                <h3 class="text-lg font-semibold text-neutral-900">Transfer Exact Amount</h3>
                <p class="text-xs text-neutral-400 mt-1">Account valid for one transaction only</p>
            </div>

            <div class="bg-neutral-50 rounded-2xl border border-neutral-100 p-5 space-y-4">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-medium text-neutral-400 uppercase">Bank</span>
                    <span class="font-semibold text-neutral-800">${data.bank_name}</span>
                </div>
                
                <div class="flex justify-between items-center group cursor-pointer" onclick="PaymentSystem._copy('${data.account_number}')">
                    <span class="text-xs font-medium text-neutral-400 uppercase">Account Number</span>
                    <div class="flex items-center gap-2">
                        <span class="text-xl font-mono font-bold text-neutral-900 tracking-wider">${data.account_number}</span>
                        <i data-lucide="copy" class="w-4 h-4 text-blue-500 opacity-50 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                </div>

                <div class="h-px bg-neutral-200"></div>

                <div class="flex justify-between items-center">
                    <span class="text-xs font-medium text-neutral-400 uppercase">Amount</span>
                    <span class="text-lg font-bold text-green-600">₦${(data.amount / 100).toLocaleString()}</span>
                </div>
            </div>

            <div class="mt-8 space-y-3">
                <button id="sm-verify-btn" class="w-full bg-neutral-900 hover:bg-black text-white font-medium py-4 rounded-2xl shadow-lg shadow-neutral-900/10 active:scale-[0.98] transition-all">
                    I Have Made The Transfer
                </button>
                <button onclick="PaymentSystem._confirmClose()" class="w-full text-xs font-medium text-neutral-400 py-3 hover:text-neutral-600 transition-colors">
                    Cancel Transaction
                </button>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
        document.getElementById('sm-verify-btn').onclick = () => this._verifyTransaction();
    },

    _renderSuccess() {
        const container = document.getElementById('sm-modal-content');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10">
                <div class="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mb-4 shadow-sm animate-bounce">
                    <i data-lucide="check" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-bold text-neutral-900">Payment Confirmed</h3>
                <p class="text-sm text-neutral-500 mt-2">Processing your order...</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    },

    _renderError(msg) {
        const container = document.getElementById('sm-modal-content');
        container.innerHTML = `
            <div class="text-center py-8">
                <div class="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i data-lucide="alert-circle" class="w-6 h-6"></i>
                </div>
                <h3 class="text-lg font-semibold text-neutral-900">Error</h3>
                <p class="text-sm text-neutral-500 mt-2 px-4">${msg}</p>
                <button onclick="PaymentSystem._closeModal()" class="mt-6 text-sm font-medium text-neutral-900 underline">
                    Close
                </button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    },

    _copy(text) {
        navigator.clipboard.writeText(text);
        this._toast("Account Number Copied");
    }
};

export default PaymentSystem;
