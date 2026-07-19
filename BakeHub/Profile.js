document.addEventListener('DOMContentLoaded', () => {

    const form = document.getElementById('profile-form');
    const inputs = form.querySelectorAll('input:not(#phone), select'); 
    const editBtn = document.getElementById('edit-btn');
    const editActions = document.getElementById('edit-actions');
    const cancelBtn = document.getElementById('cancel-btn');
    const displayName = document.getElementById('display-name');

    //Fetch Profile Data
    fetch('profile_actions.php?action=fetch')
        .then(res => res.json())
        .then(response => {
            if (response.success) {
                const user = response.data;
                document.getElementById('name').value = user.name || '';
                document.getElementById('email').value = user.email || '';
                document.getElementById('phone').value = user.phone || '';
                document.getElementById('gender').value = user.gender || '';
                document.getElementById('birthday').value = user.birthday || '';
                
                displayName.textContent = user.name;
            } else {
                //If not logged in or error, go to Home
                window.location.href = '_Home.html';
            }
        });

    //Toggle Edit Mode
    editBtn.addEventListener('click', () => {
        inputs.forEach(input => input.disabled = false);
        editActions.style.display = 'flex'; 
        editBtn.style.display = 'none'; 
    });

    //Cancel Edit
    cancelBtn.addEventListener('click', () => {
        location.reload(); 
    });

    //Save Changes (Action = update)
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const data = {
            name: document.getElementById('name').value,
            email: document.getElementById('email').value,
            phone: document.getElementById('phone').value,
            gender: document.getElementById('gender').value,
            birthday: document.getElementById('birthday').value
        };

        fetch('profile_actions.php?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        })
        .then(res => res.json())
        .then(response => {
            if (response.success) {
                alert('Profile updated!');
                location.reload();
            } else {
                alert('Error updating profile');
            }
        });
    });

    //Logout (Action = logout)
    document.getElementById('logout-btn').addEventListener('click', () => {
        fetch('profile_actions.php?action=logout')
        .then(() => {
            window.location.href = '_Home.html';
        });
    });

    //Delete Account (Action = delete)
    document.getElementById('delete-btn').addEventListener('click', () => {
        if (confirm("Are you sure? This will delete your account and order history.")) {
            fetch('profile_actions.php?action=delete')
            .then(res => res.json())
            .then(response => {
                if(response.success){
                    alert('Account deleted.');
                    window.location.href = '_Home.html';
                } else {
                    alert('Could not delete account.');
                }
            });
        }
    });
});