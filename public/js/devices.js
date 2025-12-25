const PRODUCTS = [
    { id: 'dev_1', name: "MTN 5G Router", price: 50000, img: 'router' },
    { id: 'dev_2', name: "Airtel 4G Pocket", price: 25000, img: 'wifi' },
    { id: 'dev_3', name: "E-SIM Activation", price: 5000, img: 'sim-card' },
    { id: 'dev_4', name: "Universal Mifi", price: 18000, img: 'globe' }
];

let selectedProduct = null;
let txRef = null;

function init() {
    renderProducts();
    if (window.lucide) window.lucide.createIcons();
}

function renderProducts() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';
    
    PRODUCTS.forEach(product => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-2xl shadow-sm border border-neutral-100 flex flex-col items-center text-center cursor-pointer hover:shadow-md transition-shadow';
        card.innerHTML = `
            <div class="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-3 text-neutral-400">
                <i data-lucide="${product.img}" class="w-8 h-8"></i>
            </div>
            <h3 class="text-sm font-semibold text-neutral-900 leading-tight">${product.name}</h3>
            <p class="text-xs text-neutral-500 mt-1">₦${product.price.toLocaleString()}</p>
        `;
        card.onclick = () => openModal(product);
        grid.appendChild(card);
    });
}

function openModal(product) {
    selectedProduct = product;
    document.getElementById('modal-product-name').innerText = product.name;
    document.getElementById('modal-product-price').innerText = `₦${product.price.toLocaleString()}`;
    
    // Reset State
    document.getElementById('payment-details-box').classList.add('hidden');
    document.getElementById('device-pay-btn').classList.remove('hidden');
    document.getElementById('device-verify-btn').classList.add('hidden');
    
    const modal = document.getElementById('order-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

// Event Listeners
document.getElementById('close-modal').onclick = () => {
    document.getElementById('order-modal').classList.add('hidden');
    document.getElementById('order-modal').classList.remove('flex');
};

document.getElementById('device-pay-btn').onclick = async function() {
    const name = document.getElementById('cust-name').value;
    const phone = document.getElementById('cust-phone').value;
    const address = document.getElementById('cust-address').value;

    if (!name || !phone || !address) {
        alert("Please fill all fields for delivery.");
        return;
    }

    this.disabled = true;
    this.innerText = "Processing...";

    try {
        const res = await fetch('/api/create-virtual-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                phone: phone,
                amount_kobo: selectedProduct.price * 100,
                purpose: `DEVICE: ${selectedProduct.name}`
            })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        txRef = data.transaction_reference;

        // Show Account
        document.getElementById('pay-bank').innerText = data.bank_name;
        document.getElementById('pay-acc').innerText = data.account_number;
        
        document.getElementById('payment-details-box').classList.remove('hidden');
        this.classList.add('hidden');
        document.getElementById('device-verify-btn').classList.remove('hidden');

    } catch (err) {
        alert(err.message);
        this.disabled = false;
        this.innerText = "Generate Account to Pay";
    }
};

document.getElementById('device-verify-btn').onclick = async function() {
    this.innerText = "Verifying...";
    this.disabled = true;

    try {
        const res = await fetch('/api/verify-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transaction_reference: txRef })
        });

        const data = await res.json();
        if (data.status === 'SUCCESS') {
            alert("Order Successful! We will contact you for delivery.");
            window.location.href = "/";
        } else {
            alert("Payment not yet confirmed.");
            this.innerText = "I Have Paid";
            this.disabled = false;
        }
    } catch (err) {
        alert("Error verifying payment.");
        this.disabled = false;
    }
};

init();
