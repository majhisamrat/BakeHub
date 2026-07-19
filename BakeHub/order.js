document.addEventListener('DOMContentLoaded', () => {
    
    const tableBody = document.getElementById('orders-body');
    const noOrdersMsg = document.getElementById('no-orders-message');
    const table = document.getElementById('orders-table');

    fetch('get_orders.php')
        .then(response => response.json())
        .then(data => {
            
            //Check if user is logged in
            if (data.success === false && data.message === 'Not logged in') {
                window.location.href = '_Home.html';
                return;
            }

            const orders = data.orders;

            //Check if there are orders
            if (orders.length === 0) {
                table.style.display = 'none';
                noOrdersMsg.style.display = 'block';
            } else {
                //Loop through orders and create rows
                orders.forEach(order => {
                    
                    //Format Order Date safely
                    let dateStr = 'Unknown';
                    if (order.order_date) {
                        const dateObj = new Date(order.order_date.replace(' ', 'T'));
                        if (!isNaN(dateObj)) {
                            dateStr = dateObj.toLocaleDateString() + ' ' + dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    }

                    // Format Delivery Date safely
                    let delDateStr = 'Not specified';
                    if (order.delivery_date) {
                        // Adding T00:00:00 to parse local date correctly
                        const delDateObj = new Date(order.delivery_date + 'T00:00:00');
                        if (!isNaN(delDateObj)) {
                            delDateStr = delDateObj.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
                        }
                    }

                    // Format Payment Mode safely
                    let payModeStr = 'COD';
                    if (order.payment_mode) {
                        payModeStr = order.payment_mode.toUpperCase();
                    }

                    // Format ID
                    const orderId = '#' + String(order.order_id).padStart(4, '0');

                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="order-id">${orderId}</td>
                        <td>${dateStr}</td>
                        <td style="font-weight: 600; color: #af4c0f;">${delDateStr}</td>
                        <td style="font-weight: 600; color: #4b5563;">${payModeStr}</td>
                        <td>${order.items}</td>
                        <td>₹${order.total_amount}</td>
                    `;
                    tableBody.appendChild(row);
                });
            }
        })
        .catch(error => console.error('Error fetching orders:', error));
});