// Initialize function attached to window for Router to find
import PaymentSystem from './payment.js';

window.state = {
    network: 1, // Default MTN
    plans: [],
    selectedPlan: null,
    phone: ''
};

async function init() {
    console.log("Data Page Initializing...");
    await fetchPlans();
    setupListeners();
    if (window.lucide) window.lucide.createIcons();
}

async function fetchPlans() {
    const selector = document.getElementById('plan-selector');
    selector.innerHTML = '<option>Loading plans...</option>';
    
    try {
        const res = await fetch('/api/data-plans');
        const allPlans = await res.json();
        window.state.plans = allPlans;
        renderPlans();
    } catch (e) {
        selector.innerHTML = '<option>Error loading plans</option>';
        console.error(e);
    }
}

function renderPlans() {
    const selector = document.getElementById('plan-selector');
    selector.innerHTML = '<option value="" disabled selected>Select a plan...</option>';
    
    // Filter plans based on selected network (MTN=1, GLO=2 etc mapping needed)
    // Mapping: 1=MTN, 2=GLO, 3=AIRTEL
    const networkMap = { 1: 'MTN', 2: 'GLO', 3: 'AIRTEL' };
    const currentNetwork = networkMap[window.state.network];

    const filtered = window.state.plans.filter(p => p.network === currentNetwork);
    
    filtered.forEach(plan => {
        const option = document.createElement('option');
        option.value = plan.id;
        // Convert Kobo to Naira
        const price = (plan.sellingPrice / 100).toLocaleString();
        option.textContent = `${plan.planName} - ₦${price}`;
        selector.appendChild(option);
    });
}

function setupListeners() {
    // Network Buttons
    document.querySelectorAll('.network-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            // UI Update
            document.querySelectorAll('.network-btn').forEach(b => {
                b.classList.remove('bg-yellow-400/10', 'bg-green-400/10');
                b.querySelector('.ring-indicator').classList.add('opacity-0');
            });
            
            const isMtn = btn.dataset.network === "1";
            btn.classList.add(isMtn ? 'bg-yellow-400/10' : 'bg-green-400/10');
            btn.querySelector('.ring-indicator').classList.remove('opacity-0');
            
            window.state.network = parseInt(btn.dataset.network);
            renderPlans();
        });
    });

    // Plan Select
    document.getElementById('plan-selector').addEventListener('change', (e) => {
        window.state.selectedPlan = window.state.plans.find(p => p.id === e.target.value);
    });

    // Pay Button
    document.getElementById('pay-btn').addEventListener('click', () => {
        const phone = document.getElementById('phone-input').value;
        if (!window.state.selectedPlan || !phone) {
            alert("Please select a plan and phone number");
            return;
        }

        PaymentSystem.start({
            name: "Guest User",
            phone: phone,
            amount_kobo: window.state.selectedPlan.sellingPrice,
            purpose: `${window.state.selectedPlan.network} ${window.state.selectedPlan.planName}`
        }, (txData) => {
            // On Success, call delivery
            deliverData(txData, phone);
        });
    });
}

async function deliverData(txData, phone) {
    // Call delivery API
    const res = await fetch('/api/deliver-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            transaction_reference: txData.reference, // Ensure backend returns this
            network: window.state.network,
            mobile_number: phone,
            plan_id: window.state.selectedPlan.apiPlanId,
            ported_number: false
        })
    });
    const result = await res.json();
    if(result.status === 'DELIVERED') {
        alert("Data Delivered!");
        window.location.href = '/';
    } else {
        alert("Payment received, but delivery queued/failed. Contact support.");
    }
}

// Run
init();
