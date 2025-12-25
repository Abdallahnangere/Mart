/**
 * SAUKI MART RECEIPT GENERATOR
 * Generates premium, Apple-style image receipts using html2canvas.
 * Auto-downloads as PNG.
 */

export const ReceiptGenerator = {
    config: {
        scriptUrl: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        elementId: 'sm-receipt-renderer'
    },

    /**
     * Generate and Download Receipt
     * @param {Object} tx - Transaction Details
     * {
     * transaction_reference: string,
     * amount_kobo: number,
     * status: 'SUCCESS' | 'DELIVERED',
     * purpose: string, // e.g., '1GB MTN Data' or 'MTN 5G Router'
     * date: string (ISO),
     * recipient: string (phone number)
     * }
     */
    async generate(tx) {
        try {
            await this._ensureLibrary();
            const container = this._createTemplate(tx);
            document.body.appendChild(container);

            // Wait for images (logos) to load slightly
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await window.html2canvas(container.querySelector('.receipt-card'), {
                scale: 2, // Retina quality
                backgroundColor: null,
                logging: false,
                useCORS: true
            });

            this._download(canvas, tx.transaction_reference);
            document.body.removeChild(container);
            
        } catch (error) {
            console.error("Receipt Generation Failed:", error);
            alert("Could not generate receipt image.");
        }
    },

    async _ensureLibrary() {
        if (window.html2canvas) return;
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = this.config.scriptUrl;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    },

    _createTemplate(tx) {
        const amountFormatted = `₦${(tx.amount_kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;
        const dateFormatted = new Date().toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
        
        const wrapper = document.createElement('div');
        wrapper.id = this.config.elementId;
        // Position off-screen but visible for rendering
        wrapper.style.position = 'fixed';
        wrapper.style.top = '-9999px';
        wrapper.style.left = '-9999px';
        wrapper.style.zIndex = '-100';

        wrapper.innerHTML = `
            <div class="receipt-card w-[400px] bg-neutral-50 p-8 font-sans antialiased text-neutral-900 relative overflow-hidden rounded-3xl border border-neutral-100">
                
                <!-- Header -->
                <div class="flex flex-col items-center text-center mb-8">
                    <div class="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4 border border-neutral-100">
                         <img src="/logo.png" alt="S" class="w-8 h-8 object-contain" onerror="this.style.display='none'">
                    </div>
                    <h1 class="text-sm font-bold tracking-widest uppercase text-neutral-400">Transaction Receipt</h1>
                    <div class="mt-2 text-3xl font-bold tracking-tight text-neutral-900">${amountFormatted}</div>
                    <div class="mt-2 inline-flex items-center px-3 py-1 rounded-full bg-green-100 text-green-700 text-[10px] font-bold uppercase tracking-wide">
                        <span class="w-1.5 h-1.5 rounded-full bg-green-600 mr-2"></span>
                        ${tx.status || 'SUCCESSFUL'}
                    </div>
                </div>

                <!-- Divider -->
                <div class="relative flex items-center justify-between mb-8">
                    <div class="w-3 h-3 -ml-9 bg-white rounded-full"></div>
                    <div class="flex-1 border-t-2 border-dashed border-neutral-200 mx-2"></div>
                    <div class="w-3 h-3 -mr-9 bg-white rounded-full"></div>
                </div>

                <!-- Details Grid -->
                <div class="space-y-4 text-sm">
                    <div class="flex justify-between items-start">
                        <span class="text-neutral-500">Service</span>
                        <span class="text-right font-medium text-neutral-900 max-w-[200px]">${tx.purpose}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-neutral-500">Recipient</span>
                        <span class="font-mono text-neutral-900">${tx.recipient}</span>
                    </div>
                    <div class="flex justify-between">
                        <span class="text-neutral-500">Date</span>
                        <span class="text-right text-neutral-900">${dateFormatted}</span>
                    </div>
                    <div class="flex justify-between items-start">
                        <span class="text-neutral-500">Reference</span>
                        <span class="text-right font-mono text-[10px] text-neutral-600 bg-neutral-100 px-2 py-1 rounded break-all max-w-[180px]">${tx.transaction_reference}</span>
                    </div>
                </div>

                <!-- Footer -->
                <div class="mt-10 pt-6 border-t border-neutral-200 flex items-center justify-between opacity-80">
                    <div class="flex items-center gap-2">
                        <img src="/smedan.png" class="h-6 w-auto grayscale opacity-50">
                        <div class="h-3 w-px bg-neutral-300"></div>
                        <span class="text-[8px] text-neutral-400 font-medium">Licensed &<br>Regulated</span>
                    </div>
                    <div class="text-[8px] text-neutral-400 text-right">
                        Sauki Data Links<br>
                        saukidatalinks@gmail.com
                    </div>
                </div>

                <!-- Decorative Pattern -->
                <div class="absolute top-0 right-0 -mt-10 -mr-10 w-32 h-32 bg-blue-500/5 rounded-full blur-3xl pointer-events-none"></div>
                <div class="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-purple-500/5 rounded-full blur-3xl pointer-events-none"></div>
            </div>
        `;

        return wrapper;
    },

    _download(canvas, ref) {
        const link = document.createElement('a');
        link.download = `SAUKI_RECEIPT_${ref.substring(0, 8)}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    }
};

export default ReceiptGenerator;
