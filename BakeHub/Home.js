document.addEventListener('DOMContentLoaded', () => {

    let isUserLoggedIn = false;
    let verifiedPhoneNumber = '';
    let otpService = null;
    let onlyVerificationMode = false; // True if user clicked "My Account" to log in, rather than checkout

    // OTP Service Abstraction
    class OtpService {
        constructor(providerType, firebaseConfig = {}) {
            this.providerType = providerType;
            if (providerType === 'firebase') {
                // Initialize Firebase App
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                this.auth = firebase.auth();
            }
        }

        async sendOtp(phoneNumber, recaptchaContainerId) {
            if (this.providerType === 'firebase') {
                if (!window.recaptchaVerifier) {
                    window.recaptchaVerifier = new firebase.auth.RecaptchaVerifier(recaptchaContainerId, {
                        'size': 'invisible'
                    });
                }
                const appVerifier = window.recaptchaVerifier;
                this.confirmationResult = await this.auth.signInWithPhoneNumber('+91' + phoneNumber, appVerifier);
                return true;
            } else {
                // Mock mode
                console.log(`[MockOtpProvider] Sending OTP to +91${phoneNumber}`);
                alert(`[Development Mode] OTP sent to +91${phoneNumber}.\n\n👉 Enter code: 123456`);
                this.mockPhone = '+91' + phoneNumber;
                return true;
            }
        }

        async verifyOtp(otpCode) {
            if (this.providerType === 'firebase') {
                if (!this.confirmationResult) {
                    throw new Error('No OTP request in progress.');
                }
                const credential = await this.confirmationResult.confirm(otpCode);
                const idToken = await credential.user.getIdToken();
                
                const response = await fetch('/verify-otp-firebase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idToken, phoneNumber: credential.user.phoneNumber })
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message || 'Verification failed');
                }
                return result;
            } else {
                // Mock mode
                if (otpCode !== '123456') {
                    throw new Error('Invalid OTP. Use 123456');
                }
                const response = await fetch('/verify-otp-mock', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phoneNumber: this.mockPhone })
                });
                const result = await response.json();
                if (!result.success) {
                    throw new Error(result.message || 'Mock Verification failed');
                }
                return result;
            }
        }
    }

    // Fetch config and initialize OTP service
    fetch('/api/config')
        .then(res => res.json())
        .then(config => {
            otpService = new OtpService(config.otpProvider, config.firebaseConfig);
            console.log(`BakeHub initialized in ${config.otpProvider} mode.`);
        })
        .catch(err => {
            console.error('Error fetching OTP config, defaulting to mock:', err);
            otpService = new OtpService('mock');
        });

    // CHECK USER LOGIN SESSION ON START
    const myAccountBtn = document.querySelector('.my-account-btn');
    
    function checkUserSession() {
        fetch('get_user_data.php')
            .then(response => response.json())
            .then(data => {
                if (data.logged_in) {
                    isUserLoggedIn = true;
                    verifiedPhoneNumber = data.phone || '';
                    
                    // Display name or phone in the button
                    if (myAccountBtn) {
                        myAccountBtn.innerHTML = `<span class="account-icon"></span> ${data.name}`;
                    }
                } else {
                    isUserLoggedIn = false;
                    verifiedPhoneNumber = '';
                    if (myAccountBtn) {
                        myAccountBtn.innerHTML = `<span class="account-icon"></span> My Account`;
                    }
                }
            })
            .catch(error => console.error('Error checking session:', error));
    }
    
    checkUserSession();

    // INTERCEPT PROFILE BUTTON CLICK FOR AUTH
    if (myAccountBtn) {
        myAccountBtn.addEventListener('click', (e) => {
            if (!isUserLoggedIn) {
                e.preventDefault();
                onlyVerificationMode = true;
                openCheckoutModal();
            }
        });
    }

    // CATEGORY FILTER 
    const categoryFilters = document.querySelectorAll('.category-item');
    const productCards = document.querySelectorAll('.product-card');
    const sectionTitle = document.querySelector('.featured h2');

    categoryFilters.forEach(filter => {
        filter.addEventListener('click', () => {
            const filterValue = filter.getAttribute('data-filter');
            
            // Update Title
            if (filterValue === 'all') {
                sectionTitle.textContent = "All"; 
            } else {
                const categoryName = filter.querySelector('p').textContent;
                sectionTitle.textContent = categoryName;
            }

            // Filter Cards
            productCards.forEach(card => {
                const cardCategory = card.getAttribute('data-category');

                if (filterValue === 'all') {
                    card.style.display = 'block'; 
                } else {
                    if (filterValue === cardCategory) {
                        card.style.display = 'block';
                    } else {
                        card.style.display = 'none';
                    }
                }
            });
        });
    });

    // Cart flying animation helper
    function animateFlyToCart(imgElement) {
        if (!imgElement) return;

        // Get coordinates of the original image
        const rect = imgElement.getBoundingClientRect();
        
        // Create duplicate image element
        const flyer = document.createElement('img');
        flyer.src = imgElement.src;
        flyer.classList.add('flying-img');
        flyer.style.top = `${rect.top}px`;
        flyer.style.left = `${rect.left}px`;
        flyer.style.width = `${rect.width}px`;
        flyer.style.height = `${rect.height}px`;
        
        document.body.appendChild(flyer);

        // Get cart button target coordinates
        const cartCountBadge = document.getElementById('cart-count');
        const cartCountRect = cartCountBadge.getBoundingClientRect();

        // Animate flyer towards the target
        setTimeout(() => {
            flyer.style.top = `${cartCountRect.top - 10}px`;
            flyer.style.left = `${cartCountRect.left - 10}px`;
            flyer.style.width = '24px';
            flyer.style.height = '24px';
            flyer.style.opacity = '0.3';
        }, 50);

        // Remove flyer and trigger bounce on complete
        flyer.addEventListener('transitionend', () => {
            flyer.remove();
            
            // Trigger bounce
            cartCountBadge.classList.add('badge-bounce');
            cartCountBadge.addEventListener('animationend', () => {
                cartCountBadge.classList.remove('badge-bounce');
            }, { once: true });
        });
    }

    // CART LOGIC
    const cartLink = document.getElementById('cart-link'); 
    const cartSidebar = document.getElementById('cart-sidebar');
    const closeCartBtn = document.getElementById('close-cart');
    const addToCartButtons = document.querySelectorAll('.add-to-cart-btn');
    const cartItemsContainer = document.getElementById('cart-items-container');
    const cartTotalEl = document.getElementById('cart-total');
    const cartCountEl = document.getElementById('cart-count');

    let cart = [];

    // Open cart
    if (cartLink) {
        cartLink.addEventListener('click', (e) => {
            e.preventDefault();
            cartSidebar.classList.add('active');
        });
    }

    // Close cart
    if (closeCartBtn) {
        closeCartBtn.addEventListener('click', () => {
            cartSidebar.classList.remove('active');
        });
    }

    // Add to cart buttons
    addToCartButtons.forEach(button => {
        button.addEventListener('click', () => {
            const productCard = button.closest('.product-card');
            const name = productCard.querySelector('h3').innerText;
            const price = productCard.querySelector('.price').innerText;
            const imageEl = productCard.querySelector('img');
            const imageSrc = imageEl.src;

            // Trigger fly animation
            animateFlyToCart(imageEl);

            const existingItem = cart.find(item => item.name === name);
            if (existingItem) {
                existingItem.quantity += 1;
            } else {
                cart.push({
                    name: name,
                    price: price,
                    imageSrc: imageSrc,
                    quantity: 1
                });
            }
            renderCartItems();
        });
    });

    // Remove / Increase / Decrease from cart
    if (cartItemsContainer) {
        cartItemsContainer.addEventListener('click', (e) => {
            const target = e.target;
            
            // Click: Remove from cart
            if (target.classList.contains('remove-from-cart')) {
                const name = target.dataset.name || target.closest('.cart-item').dataset.name;
                cart = cart.filter(item => item.name !== name);
                renderCartItems();
                return;
            }

            // Click: Increase quantity
            if (target.classList.contains('increase-qty')) {
                const name = target.dataset.name;
                const item = cart.find(i => i.name === name);
                if (item) {
                    item.quantity += 1;
                    renderCartItems();
                }
                return;
            }

            // Click: Decrease quantity
            if (target.classList.contains('decrease-qty')) {
                const name = target.dataset.name;
                const item = cart.find(i => i.name === name);
                if (item) {
                    item.quantity -= 1;
                    if (item.quantity <= 0) {
                        cart = cart.filter(i => i.name !== name);
                    }
                    renderCartItems();
                }
                return;
            }
        });
    }

    // --- CHECKOUT MODAL FLOW LOGIC ---
    const checkoutModal = document.getElementById('checkoutModalOverlay');
    const closeCheckoutBtn = document.getElementById('closeCheckoutModal');
    const orderNowBtn = document.querySelector('.order-now-btn');

    // Steps containers
    const stepAuth = document.getElementById('checkout-step-auth');
    const stepAddress = document.getElementById('checkout-step-address');
    const stepPayment = document.getElementById('checkout-step-payment');

    // Indicators
    const indAuth = document.getElementById('step-ind-auth');
    const indAddress = document.getElementById('step-ind-address');
    const indPayment = document.getElementById('step-ind-payment');

    function openCheckoutModal() {
        if (cart.length === 0 && !onlyVerificationMode) {
            alert("Your cart is empty! Please add items first.");
            return;
        }

        checkoutModal.classList.add('show');
        cartSidebar.classList.remove('active');

        const dateInput = document.getElementById('checkout-delivery-date');
        if (dateInput) {
            const today = new Date().toISOString().split('T')[0];
            dateInput.min = today;
            if (!dateInput.value) {
                dateInput.value = today;
            }
        }

        // Reset step content visibility
        stepAuth.classList.remove('active');
        stepAddress.classList.remove('active');
        stepPayment.classList.remove('active');

        // Reset indicators
        indAuth.classList.remove('active', 'completed');
        indAddress.classList.remove('active', 'completed');
        indPayment.classList.remove('active', 'completed');

        if (isUserLoggedIn) {
            // Already logged in - Skip Step 1 (Auth), go straight to Step 2 (Address)
            indAuth.classList.add('completed');
            indAddress.classList.add('active');
            stepAddress.classList.add('active');
            
            // Fill address phone
            document.getElementById('address-phone').value = verifiedPhoneNumber;
            
            // Pre-fill name if profile actions can fetch it
            fetch('profile_actions.php?action=fetch')
                .then(res => res.json())
                .then(response => {
                    if (response.success && response.data) {
                        document.getElementById('address-name').value = response.data.name || '';
                    }
                });
        } else {
            // Unauthenticated - Go to Step 1 (Auth)
            indAuth.classList.add('active');
            stepAuth.classList.add('active');
            
            // Reset OTP inputs
            document.getElementById('checkout-phone').value = '';
            document.getElementById('checkout-otp').value = '';
            document.getElementById('otp-input-area').style.display = 'none';
            document.getElementById('btn-send-otp').classList.remove('loading');
            document.getElementById('btn-send-otp').innerText = 'Send OTP';
            document.getElementById('btn-verify-otp').classList.remove('loading');
            document.getElementById('btn-verify-otp').innerText = 'Verify & Continue';
        }
    }

    if (orderNowBtn) {
        orderNowBtn.addEventListener('click', () => {
            onlyVerificationMode = false;
            openCheckoutModal();
        });
    }

    if (closeCheckoutBtn) {
        closeCheckoutBtn.addEventListener('click', () => {
            checkoutModal.classList.remove('show');
        });
    }

    // Step 1: Send OTP Event Handler
    const btnSendOtp = document.getElementById('btn-send-otp');
    btnSendOtp.addEventListener('click', async () => {
        const phoneVal = document.getElementById('checkout-phone').value.trim();
        if (!phoneVal || phoneVal.length !== 10 || isNaN(phoneVal)) {
            alert('Please enter a valid 10-digit mobile number.');
            return;
        }

        btnSendOtp.classList.add('loading');
        btnSendOtp.innerText = 'Sending...';

        try {
            await otpService.sendOtp(phoneVal, 'recaptcha-container');
            document.getElementById('otp-input-area').style.display = 'block';
            btnSendOtp.innerText = 'OTP Sent';
        } catch (e) {
            console.error('Error sending OTP:', e);
            alert('Failed to send OTP: ' + e.message);
            btnSendOtp.classList.remove('loading');
            btnSendOtp.innerText = 'Send OTP';
        }
    });

    // Step 1: Verify OTP Event Handler
    const btnVerifyOtp = document.getElementById('btn-verify-otp');
    btnVerifyOtp.addEventListener('click', async () => {
        const otpVal = document.getElementById('checkout-otp').value.trim();
        if (!otpVal || otpVal.length !== 6 || isNaN(otpVal)) {
            alert('Please enter a 6-digit OTP code.');
            return;
        }

        btnVerifyOtp.classList.add('loading');
        btnVerifyOtp.innerText = 'Verifying...';

        try {
            const authResult = await otpService.verifyOtp(otpVal);
            alert('Verification successful!');
            
            // Update local session state
            isUserLoggedIn = true;
            checkUserSession(); // Update header
            
            if (onlyVerificationMode) {
                // If we were only verifying to access "My Account" page, redirect to Profile.html
                checkoutModal.classList.remove('show');
                window.location.href = 'Profile.html';
            } else {
                // Otherwise transition to step 2 (Address)
                indAuth.classList.remove('active');
                indAuth.classList.add('completed');
                
                indAddress.classList.add('active');
                stepAuth.classList.remove('active');
                stepAddress.classList.add('active');
                
                // Set verified phone
                const phoneVal = document.getElementById('checkout-phone').value.trim();
                verifiedPhoneNumber = '+91' + phoneVal;
                document.getElementById('address-phone').value = verifiedPhoneNumber;
            }
        } catch (e) {
            console.error('OTP Verification Error:', e);
            alert('Verification failed: ' + e.message);
            btnVerifyOtp.classList.remove('loading');
            btnVerifyOtp.innerText = 'Verify & Continue';
        }
    });

    // Step 2: Save Address Event Handler
    const btnSaveAddress = document.getElementById('btn-save-address');
    btnSaveAddress.addEventListener('click', () => {
        const name = document.getElementById('address-name').value.trim();
        const address = document.getElementById('address-line').value.trim();
        const city = document.getElementById('address-city').value.trim();
        const zip = document.getElementById('address-zip').value.trim();

        if (!name || !address || !city || !zip) {
            alert('Please fill out all address fields.');
            return;
        }

        // Auto update profile name on the backend since we have it now
        fetch('profile_actions.php?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name })
        }).then(checkUserSession);

        // Transition to Step 3 (Payment)
        indAddress.classList.remove('active');
        indAddress.classList.add('completed');

        indPayment.classList.add('active');
        stepAddress.classList.remove('active');
        stepPayment.classList.add('active');

        // Populate Order Summary
        let totalCount = 0;
        let totalAmount = 0;
        cart.forEach(item => {
            totalCount += item.quantity;
            totalAmount += parseFloat(item.price.replace('₹', '')) * item.quantity;
        });
        document.getElementById('summary-items-count').innerText = totalCount;
        document.getElementById('summary-total-amount').innerText = `₹${totalAmount.toFixed(2)}`;
    });

    // Payment option interactive selection
    const paymentCards = document.querySelectorAll('.payment-option-card');
    paymentCards.forEach(card => {
        card.addEventListener('click', () => {
            paymentCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            card.querySelector('input[type="radio"]').checked = true;
        });
    });

    // Step 3: Pay & Place Order Event Handler
    const btnPlaceOrder = document.getElementById('btn-place-order');
    const orderOverlay = document.getElementById('orderOverlay');
    const closePopupBtn = document.getElementById('closePopupBtn');

    btnPlaceOrder.addEventListener('click', () => {
        const deliveryDateVal = document.getElementById('checkout-delivery-date').value;
        if (!deliveryDateVal) {
            alert('Please select a delivery date.');
            return;
        }

        btnPlaceOrder.innerText = 'Processing Order...';
        btnPlaceOrder.classList.add('loading');

        const itemNames = cart.map(item => `${item.name} (x${item.quantity})`).join(', ');
        
        let totalAmount = 0;
        cart.forEach(item => {
            totalAmount += parseFloat(item.price.replace('₹', '')) * item.quantity;
        });

        const paymentMethodEl = document.querySelector('input[name="payment-method"]:checked');
        const paymentMethodVal = paymentMethodEl ? paymentMethodEl.value : 'cod';

        // Send order placement to backend
        fetch('place_order.php', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: itemNames,
                total: totalAmount,
                deliveryDate: deliveryDateVal,
                paymentMode: paymentMethodVal
            })
        })
        .then(response => response.json()) 
        .then(result => {
            if (result.success) {
                // Clear cart
                cart = [];
                renderCartItems();
                
                // Hide checkout modal, show Success Cake overlay
                checkoutModal.classList.remove('show');
                orderOverlay.classList.add('show'); 
            } else {
                alert("Order failed: " + result.message);
                btnPlaceOrder.innerText = 'Confirm Order';
                btnPlaceOrder.classList.remove('loading');
            }
        })
        .catch(error => {
            console.error('Order error:', error);
            alert("Error placing order. Please try again.");
            btnPlaceOrder.innerText = 'Confirm Order';
            btnPlaceOrder.classList.remove('loading');
        });
    });

    // Close Popup Logic
    if (closePopupBtn) {
        closePopupBtn.addEventListener('click', () => {
            orderOverlay.classList.remove('show');
        });
    }

    if (orderOverlay) {
        orderOverlay.addEventListener('click', (e) => {
            if (e.target === orderOverlay) {
                orderOverlay.classList.remove('show');
            }
        });
    }

    // RENDER FUNCTION FOR CART
    function renderCartItems() {
        cartItemsContainer.innerHTML = '';
        let total = 0;
        let totalCount = 0;

        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p style="text-align:center; color: #888;">Your cart is empty.</p>';
        } else {
             cart.forEach(item => {
                const cartItem = document.createElement('div');
                cartItem.classList.add('cart-item');
                cartItem.dataset.name = item.name; 

                cartItem.innerHTML = `
                    <img src="${item.imageSrc}" alt="${item.name}">
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <p>${item.price}</p>
                        <div class="cart-qty-controls">
                            <button class="cart-qty-btn decrease-qty" data-name="${item.name}">&minus;</button>
                            <span class="cart-qty-num">${item.quantity}</span>
                            <button class="cart-qty-btn increase-qty" data-name="${item.name}">&plus;</button>
                        </div>
                    </div>
                    <i class="fas fa-times remove-from-cart" data-name="${item.name}"></i>
                `;
                cartItemsContainer.appendChild(cartItem);
                
                const itemPrice = parseFloat(item.price.replace('₹', ''));
                total += itemPrice * item.quantity;
                totalCount += item.quantity;
            });
        }
        if(cartTotalEl) cartTotalEl.innerText = `₹${total.toFixed(2)}`;
        if(cartCountEl) cartCountEl.innerText = totalCount;
    }

    // Initial render
    renderCartItems();

    // --- CONTACT FORM LOGIC ---
    const contactForm = document.getElementById('contact-form');
    const contactSuccess = document.getElementById('contact-success-msg');
    const contactResetBtn = document.getElementById('contact-reset-btn');

    if (contactForm) {
        contactForm.addEventListener('submit', (e) => {
            e.preventDefault();
            contactForm.style.display = 'none';
            contactSuccess.style.display = 'block';
        });
    }

    if (contactResetBtn) {
        contactResetBtn.addEventListener('click', () => {
            contactForm.reset();
            contactSuccess.style.display = 'none';
            contactForm.style.display = 'block';
        });
    }

    // --- SMOOTH SCROLLING FOR HASH LINKS ---
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;
            const target = document.querySelector(href);
            if (target) {
                e.preventDefault();
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        });
    });

    // Check for hash in URL on page load (e.g. redirected from other pages)
    if (window.location.hash) {
        setTimeout(() => {
            const target = document.querySelector(window.location.hash);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth'
                });
            }
        }, 500);
    }
});