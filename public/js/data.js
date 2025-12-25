// Hardcoded config for MVP (Real app would fetch from /api/get-plans)
const PLANS = {
    1: [ // MTN
        { id: 101, name: "1GB SME", price: 280, apiPlanId: "1001" },
        { id: 102, name: "2GB SME", price: 560, apiPlanId: "1002" },
        { id: 103, name: "5GB SME", price: 1400, apiPlanId: "1005" },
        { id: 104, name: "10GB SME", price: 2800, apiPlanId: "1010" }
    ],
    2: [ // GLO
        { id: 201, name: "1.05GB Corporate", price: 300, apiPlanId: "2001" },
        { id: 202, name: "2.5GB Corporate", price: 750, apiPlanId: "2002" }
    ]
};

let state = {
    network: 1,
    plan: null,
    phone: '',
    txRef: null,
    isProcessing: false
};

// Initialize
function init() {
    renderPlans();
    setupListeners();
    if (window.lucide) window.lucide.createIcons();
}

function renderPlans() {
    const selector = document.getElementById('plan-selector');
    selector.innerHTML = '<option value="" disabled selected>Select a plan...</option>';
    
    const networkPlans = PLANS[state.network] || [];
    networkPlans.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.id;
        option.textContent = `${plan.name} - ₦${plan.price}`;
        selector.appendChild(option);
    });
}

function setupListeners() {
    // Network Switching
    document.querySelectorAll('.network-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.network-btn').forEach(b => {
                b.classList.remove('bg-yellow-400/10', 'bg-green-400/10');
                b.querySelector('.ring-indicator').classList.remove('opacity-100');
                b.querySelector('.ring-indicator').classList.add('opacity-0');
            });

            // Active styling logic
            const isMtn = btn.dataset.network === "1";
            btn.classList.add(isMtn ? 'bg-yellow-400/10' : 'bg-green-400/10');
            btn.querySelector('.ring-indicator').classList.remove('opacity-0');
            btn.querySelector('.ring-indicator').classList.add('opacity-100');
            
            state.network = parseInt(btn.dataset.network);
            state.plan = null;
            renderPlans();
        });
    });

    // Plan Selection
    document.getElementById('plan-selector').addEventListener('change', (e) => {
        const plans = PLANS[state.network];
        state.plan = plans.find(p => p.id == e.target.value);
    });

    // Pay Button
    document.getElementById('pay-btn').addEventListener('click', handlePaymentStart);

    // Verify Button
    document.getElementById('verify-btn').addEventListener('click', handleVerification);

    // Cancel Button
    document.getElementById('cancel-btn').addEventListener('click', () => {
        document.getElementById('payment-modal').classList.add('hidden');
        document.getElementById('payment-modal').classList.remove('flex');
    });
}

async function handlePaymentStart() {
    const phone = document.getElementById('phone-input').value;
    if (!state.plan || !phone || phone.length < 10) {
        alert("Please select a plan and enter a valid phone number.");
        return;
    }
    state.phone = phone;

    setLoading(true, "Generating Account...");

    try {
        const res = await fetch('/api/create-virtual-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: "Guest User", // In real app, ask name
                phone: state.phone,
                amount_kobo: state.plan.price * 100,
                purpose: "DATA"
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        state.txRef = data.transaction_reference;

        // Show Modal
        document.getElementById('bank-name').innerText = data.bank_name;
        document.getElementById('account-number').innerText = data.account_number;
        document.getElementById('amount-display').innerText = `₦${state.plan.price}`;
        
        const modal = document.getElementById('payment-modal');
        modal.classList.remove('hidden');
        modal.classList.add('flex');

    } catch (err) {
        alert(err.message);
    } finally {
        setLoading(false);
    }
}

async function handleVerification() {
    const btn = document.getElementById('verify-btn');
    const originalText = btn.innerText;
    btn.innerText = "Verifying...";
    btn.disabled = true;

    try {
        const res = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_reference: state.txRef })
        });

        const data = await res.json();

        if (data.status === 'SUCCESS') {
            // Trigger Delivery
            btn.innerText = "Delivering Data...";
            await deliverData();
        } else {
            alert("Payment not found yet. Please wait a moment and try again.");
            btn.innerText = originalText;
            btn.disabled = false;
        }
    } catch (err) {
        alert("Verification error: " + err.message);
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

async function deliverData() {
    try {
        const res = await fetch('/api/deliver-data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                transaction_reference: state.txRef,
                network: state.network,
                mobile_number: state.phone,
                plan_id: state.plan.apiPlanId,
                ported_number: false
            })
        });

        const data = await res.json();
        
        if (data.status === 'DELIVERED') {
            alert("Data Sent Successfully!");
            window.location.href = "/";
        } else {
            throw new Error(data.error || "Delivery failed");
        }
    } catch (err) {
        alert("Payment received but delivery failed: " + err.message + ". Please contact support.");
    }
}

function setLoading(isLoading, text) {
    const btn = document.getElementById('pay-btn');
    if (isLoading) {
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-pulse">${text}</span>`;
    } else {
        btn.disabled = false;
        btn.innerHTML = `<span>Proceed to Payment</span> <i data-lucide="arrow-right" class="w-5 h-5"></i>`;
        if (window.lucide) window.lucide.createIcons();
    }
}

// Run immediately as module
init();
