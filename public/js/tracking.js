function init() {
    if (window.lucide) window.lucide.createIcons();
    
    const btn = document.getElementById('btn-track');
    if (btn) {
        btn.addEventListener('click', fetchHistory);
    }
}

async function fetchHistory() {
    const phone = document.getElementById('track-phone').value;
    const list = document.getElementById('history-list');
    const btn = document.getElementById('btn-track');

    if (!phone || phone.length < 10) {
        alert("Please enter a valid phone number");
        return;
    }

    btn.innerHTML = `<span class="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full block"></span>`;
    btn.disabled = true;

    try {
        const res = await fetch(`/api/track-transaction?phone=${phone}`);
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to fetch");

        if (data.history.length === 0) {
            list.innerHTML = `<div class="text-center py-10 text-neutral-400 text-sm">No transactions found for this number.</div>`;
        } else {
            list.innerHTML = data.history.map(tx => `
                <div class="bg-white p-4 rounded-2xl border border-neutral-100 shadow-sm flex items-center justify-between">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-bold text-neutral-900">${tx.amount}</span>
                            ${getStatusBadge(tx.status)}
                        </div>
                        <p class="text-xs text-neutral-400 mt-1">${new Date(tx.date).toLocaleDateString()} • ${new Date(tx.date).toLocaleTimeString()}</p>
                        ${tx.delivery_status !== 'N/A' ? `<p class="text-[10px] mt-1 text-neutral-500">Delivery: ${tx.delivery_status}</p>` : ''}
                    </div>
                    ${tx.receipt_available ? 
                        `<button class="p-2 bg-neutral-50 rounded-full hover:bg-neutral-100 text-neutral-600">
                            <i data-lucide="download" class="w-4 h-4"></i>
                        </button>` : ''
                    }
                </div>
            `).join('');
            
            if (window.lucide) window.lucide.createIcons();
        }

    } catch (err) {
        alert(err.message);
    } finally {
        btn.innerHTML = `<i data-lucide="search" class="w-5 h-5"></i>`;
        if (window.lucide) window.lucide.createIcons();
        btn.disabled = false;
    }
}

function getStatusBadge(status) {
    if (status === 'SUCCESS') return `<span class="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-md">PAID</span>`;
    if (status === 'PENDING') return `<span class="px-2 py-0.5 bg-yellow-100 text-yellow-700 text-[10px] font-bold rounded-md">PENDING</span>`;
    return `<span class="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-md">${status}</span>`;
}

init();
