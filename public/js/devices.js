import PaymentSystem from './payment.js';

let products = [];
let selectedProduct = null;

async function init() {
    await fetchProducts();
    if (window.lucide) window.lucide.createIcons();
}

async function fetchProducts() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '<div class="col-span-2 text-center py-10">Loading devices...</div>';
    
    try {
        const res = await fetch('/api/products');
        products = await res.json();
        renderProducts();
    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div class="col-span-2 text-center text-red-500">Failed to load devices</div>';
    }
}

function renderProducts() {
    const grid = document.getElementById('products-grid');
    grid.innerHTML = '';
    
    products.forEach(product => {
        const card = document.createElement('div');
        card.className = 'bg-white p-4 rounded-2xl shadow-sm border border-neutral-100 flex flex-col items-center text-center cursor-pointer hover:shadow-md transition-shadow animate-fade-in';
        
        // Dynamic Icon mapping based on name
        let icon = 'smartphone';
        if (product.name.toLowerCase().includes('router')) icon = 'router';
        if (product.name.toLowerCase().includes('wifi') || product.name.toLowerCase().includes('mifi')) icon = 'wifi';
        if (product.name.toLowerCase().includes('sim')) icon = 'sim-card';

        const price = (product.priceInKobo / 100).toLocaleString();

        card.innerHTML = `
            <div class="w-16 h-16 bg-neutral-50 rounded-full flex items-center justify-center mb-3 text-neutral-400">
                <i data-lucide="${icon}" class="w-8 h-8"></i>
            </div>
            <h3 class="text-sm font-semibold text-neutral-900 leading-tight">${product.name}</h3>
            <p class="text-xs text-neutral-500 mt-1">₦${price}</p>
        `;
        card.onclick = () => openModal(product);
        grid.appendChild(card);
    });
    if (window.lucide) window.lucide.createIcons();
}

function openModal(product) {
    selectedProduct = product;
    document.getElementById('modal-product-name').innerText = product.name;
    document.getElementById('modal-product-price').innerText = `₦${(product.priceInKobo/100).toLocaleString()}`;
    
    const modal = document.getElementById('order-modal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    
    // Bind Pay Button
    document.getElementById('device-pay-btn').onclick = () => {
        const name = document.getElementById('cust-name').value;
        const phone = document.getElementById('cust-phone').value;
        const address = document.getElementById('cust-address').value;

        if (!name || !phone || !address) {
            alert("Please fill in delivery details");
            return;
        }

        PaymentSystem.start({
            name: name,
            phone: phone,
            amount_kobo: product.priceInKobo,
            purpose: `Device: ${product.name}`
        }, () => {
            alert("Order Success! We will contact you for delivery.");
            window.location.href = '/';
        });
    };

    document.getElementById('close-modal').onclick = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };
}

init();
