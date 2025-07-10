// Application State
let currentUser = null;
let expenses = [];
let monthlyBudget = 50000; // Default budget in Naira (₦50,000)

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    // Auth state listener
    firebase.auth().onAuthStateChanged(async (user) => {
        if (user) {
            // User is signed in
            try {
                const userDoc = await db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    currentUser = {
                        uid: user.uid,
                        ...userDoc.data()
                    };
                    await showApp();
                } else {
                    await firebase.auth().signOut();
                    showLogin();
                    showError('loginForm', 'User data not found. Please sign up again.');
                }
            } catch (error) {
                console.error('Error loading user:', error);
                showLogin();
            }
        } else {
            // User is signed out
            showLanding();
        }
    });
});

// Utility function to format Naira currency
function formatNaira(amount) {
    return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: 'NGN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

// Firestore Functions
async function saveUserToFirestore(userData) {
    try {
        await db.collection('users').doc(userData.uid).set(userData);
    } catch (error) {
        console.error('Error saving user:', error);
        throw error;
    }
}

async function loadUserFromFirestore(uid) {
    try {
        const userDoc = await db.collection('users').doc(uid).get();
        return userDoc.exists ? userDoc.data() : null;
    } catch (error) {
        console.error('Error loading user:', error);
        throw error;
    }
}

async function saveExpensesToFirestore() {
    if (!currentUser) return;
    try {
        const batch = db.batch();
        expenses.forEach(expense => {
            const expenseRef = db.collection(`users/${currentUser.uid}/expenses`).doc(expense.id.toString());
            batch.set(expenseRef, expense);
        });
        await batch.commit();
    } catch (error) {
        console.error('Error saving expenses:', error);
        throw error;
    }
}

async function loadExpensesFromFirestore() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection(`users/${currentUser.uid}/expenses`).get();
        expenses = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
        console.error('Error loading expenses:', error);
        expenses = [];
        throw error;
    }
}

async function deleteExpenseFromFirestore(id) {
    if (!currentUser) return;
    try {
        await db.collection(`users/${currentUser.uid}/expenses`).doc(id.toString()).delete();
    } catch (error) {
        console.error('Error deleting expense:', error);
        throw error;
    }
}

// Page Navigation Functions
function showLanding() {
    document.getElementById('landingPage').style.display = 'flex';
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
}

function showLogin() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'flex';
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById('appContainer').style.display = 'none';
}

function showSignup() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'flex';
    document.getElementById('appContainer').style.display = 'none';
}

async function showApp() {
    document.getElementById('landingPage').style.display = 'none';
    document.getElementById('loginPage').style.display = 'none';
    document.getElementById('signupPage').style.display = 'none';
    document.getElementById('appContainer').style.display = 'block';
    
    await loadExpensesFromFirestore();
    monthlyBudget = currentUser.budget || 50000;
    document.getElementById('userWelcome').textContent = `Welcome, ${currentUser.name}!`;
    document.getElementById('monthlyBudget').textContent = formatNaira(monthlyBudget);
    updateSummary();
    renderExpenses();
}

// Authentication Functions
function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
    return password.length >= 6;
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    const errorDiv = element.parentNode.querySelector('.error-message');
    if (errorDiv) errorDiv.remove();
    
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = message;
    element.parentNode.appendChild(error);
    setTimeout(() => error.parentNode && error.remove(), 5000);
}

function showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    const successDiv = element.parentNode.querySelector('.success-message');
    if (successDiv) successDiv.remove();
    
    const success = document.createElement('div');
    success.className = 'success-message';
    success.textContent = message;
    element.parentNode.appendChild(success);
    setTimeout(() => success.parentNode && success.remove(), 3000);
}

// Signup Form Handler
document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('signupName').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const budget = parseFloat(document.getElementById('signupBudget').value) || 50000;
    
    // Clear previous errors
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    
    if (!name) return showError('signupName', 'Please enter your full name');
    if (!validateEmail(email)) return showError('signupEmail', 'Please enter a valid email address');
    if (!validatePassword(password)) return showError('signupPassword', 'Password must be at least 6 characters long');
    if (password !== confirmPassword) return showError('confirmPassword', 'Passwords do not match');
    if (budget <= 0) return showError('signupBudget', 'Please enter a valid budget amount (minimum ₦1,000)');
    
    try {
        // Show loader
        document.getElementById('signupLoader').style.display = 'block';

        // Create user with email/password
        const userCredential = await firebase.auth().createUserWithEmailAndPassword(email, password);

        // Save additional user data to Firestore
        const userData = {
            name,
            email,
            budget,
            dateCreated: new Date().toISOString(),
            uid: userCredential.user.uid
        };

        await db.collection('users').doc(userCredential.user.uid).set(userData);

        // Show success message immediately
        showSuccess('signupForm', 'Account created successfully! Redirecting to login...');

        // Hide loader
        document.getElementById('signupLoader').style.display = 'none';

        // Redirect after a short delay
        setTimeout(() => showLogin(), 2000);
    
    } catch (error) {
        console.error('Signup error:', error);
        let errorMessage = 'Signup failed. Please try again.';

        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already registered. Please login instead.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters';
        }

        showError('signupForm', errorMessage);

        // Hide loader on error
        document.getElementById('signupLoader').style.display = 'none';
    }
});

// Login Form Handler
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    // Clear previous errors
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    
    if (!validateEmail(email)) return showError('loginEmail', 'Please enter a valid email address');
    if (!password) return showError('loginPassword', 'Please enter your password');
    
    try {
        const userCredential = await firebase.auth().signInWithEmailAndPassword(email, password);
        const userDoc = await db.collection('users').doc(userCredential.user.uid).get();
        
        if (userDoc.exists) {
            currentUser = {
                uid: userCredential.user.uid,
                ...userDoc.data()
            };
            showSuccess('loginForm', 'Login successful! Loading app...');
            await showApp();
        } else {
            showError('loginForm', 'User data not found. Please contact support.');
            await firebase.auth().signOut();
        }
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Login failed. Please check your credentials.';
        
        if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email. Please sign up.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password. Please try again.';
        }
        
        showError('loginForm', errorMessage);
    }
});

// Logout Function
async function logout() {
    try {
        await firebase.auth().signOut();
        currentUser = null;
        expenses = [];
        showLanding();
    } catch (error) {
        console.error('Error logging out:', error);
    }
}

// Expense Management Functions
document.getElementById('expenseForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const description = document.getElementById('expenseDescription').value.trim();
    const amount = parseFloat(document.getElementById('expenseAmount').value);
    const category = document.getElementById('expenseCategory').value;
    
    if (!description) return showError('expenseDescription', 'Please enter a description');
    if (!amount || amount <= 0) return showError('expenseAmount', 'Please enter a valid amount in Naira');
    if (!category) return showError('expenseCategory', 'Please select a category');
    
    const expense = {
        id: Date.now(),
        description,
        amount,
        category,
        date: new Date().toISOString(),
        dateFormatted: new Date().toLocaleDateString('en-NG')
    };
    
    expenses.push(expense);
    await saveExpensesToFirestore();
    updateSummary();
    renderExpenses();
    document.getElementById('expenseForm').reset();
    showSuccess('expenseForm', 'Expense added successfully!');
});

async function deleteExpense(id) {
    if (confirm('Are you sure you want to delete this expense?')) {
        expenses = expenses.filter(expense => expense.id !== id);
        await deleteExpenseFromFirestore(id);
        updateSummary();
        renderExpenses();
    }
}

// Summary Function
function updateSummary() {
    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
    const remaining = monthlyBudget - totalExpenses;
    
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthlyExpenses = expenses.filter(expense => {
        const expenseDate = new Date(expense.date);
        return expenseDate.getMonth() === currentMonth && expenseDate.getFullYear() === currentYear;
    }).reduce((sum, expense) => sum + expense.amount, 0);
    
    document.getElementById('monthlyBudget').textContent = formatNaira(monthlyBudget);
    document.getElementById('totalSpent').textContent = formatNaira(totalExpenses);
    document.getElementById('remainingBudget').textContent = formatNaira(remaining);
    document.getElementById('monthlyExpenses').textContent = formatNaira(monthlyExpenses);
    
    const remainingElement = document.getElementById('remainingBudget').parentElement;
    remainingElement.style.color = remaining < 0 ? '#ff6b6b' : remaining < monthlyBudget * 0.2 ? '#ffd93d' : '#4caf50';
}

// Render Expenses
function renderExpenses() {
    const expenseList = document.getElementById('expenseList');
    const filterCategory = document.getElementById('filterCategory').value;
    
    let filteredExpenses = filterCategory ? expenses.filter(expense => expense.category === filterCategory) : expenses;
    filteredExpenses.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    expenseList.innerHTML = filteredExpenses.length === 0 ?
        '<p style="color: white; text-align: center;">No expenses found. Add your first expense above!</p>' :
        filteredExpenses.map(expense => `
            <div class="expense-item">
                <div class="expense-details">
                    <div class="expense-title">${expense.description}</div>
                    <div class="expense-date">${expense.dateFormatted}</div>
                </div>
                <div style="display: flex; align-items: center; gap: 1rem;">
                    <span class="expense-category">${getCategoryIcon(expense.category)} ${formatCategoryName(expense.category)}</span>
                    <span class="expense-amount">${formatNaira(expense.amount)}</span>
                    <button class="delete-btn" onclick="deleteExpense(${expense.id})">Delete</button>
                </div>
            </div>
        `).join('');
}

function filterExpenses() {
    renderExpenses();
}

function getCategoryIcon(category) {
    const icons = {
        'academic': '📚',
        'food': '🍕',
        'entertainment': '🎮',
        'transportation': '🚗',
        'personal': '🛍️',
        'housing': '🏠',
        'other': '📦'
    };
    return icons[category] || '📦';
}

function formatCategoryName(category) {
    const names = {
        'academic': 'Academic',
        'food': 'Food & Dining',
        'entertainment': 'Entertainment',
        'transportation': 'Transportation',
        'personal': 'Personal Care',
        'housing': 'Housing',
        'other': 'Other'
    };
    return names[category] || 'Other';
}

// Navigation Functions
function showDashboard() {
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
}