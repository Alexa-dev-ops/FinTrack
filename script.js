// Application State
let currentUser = null;
let expenses = [];
let monthlyBudget = 50000; // Default budget in Naira (₦50,000)
let isEditingExpense = false;
let currentEditExpenseId = null;

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

async function updateUserBudgetInFirestore(newBudget) {
    if (!currentUser) return;
    try {
        await db.collection('users').doc(currentUser.uid).update({
            budget: newBudget
        });
        currentUser.budget = newBudget;
    } catch (error) {
        console.error('Error updating budget:', error);
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

async function updateExpenseInFirestore(expense) {
    if (!currentUser) return;
    try {
        await db.collection(`users/${currentUser.uid}/expenses`).doc(expense.id.toString()).update(expense);
    } catch (error) {
        console.error('Error updating expense:', error);
        throw error;
    }
}

async function loadExpensesFromFirestore() {
    if (!currentUser) return;
    try {
        const snapshot = await db.collection(`users/${currentUser.uid}/expenses`).get();
        expenses = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                ...data,
                id: data.id // Use the ID from the document data, not the document ID
            };
        });
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
    
    try {
        if (isEditingExpense) {
            // Update existing expense
            const expenseId = document.getElementById('expenseId').value;
            const expenseIndex = expenses.findIndex(exp => exp.id.toString() === expenseId);
            
            if (expenseIndex !== -1) {
                const updatedExpense = {
                    ...expenses[expenseIndex],
                    description,
                    amount,
                    category,
                    date: new Date().toISOString(),
                    dateFormatted: new Date().toLocaleDateString('en-NG')
                };
                
                expenses[expenseIndex] = updatedExpense;
                await updateExpenseInFirestore(updatedExpense);
                
                showSuccess('expenseForm', 'Expense updated successfully!');
            }
        } else {
            // Add new expense
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
            showSuccess('expenseForm', 'Expense added successfully!');
        }
        
        // Reset form and UI
        document.getElementById('expenseForm').reset();
        updateSummary();
        renderExpenses();
        cancelEdit();
    } catch (error) {
        console.error('Error saving expense:', error);
        showError('expenseForm', 'Failed to save expense. Please try again.');
    }
});

// Edit Expense Function
function editExpense(id) {
    const expense = expenses.find(exp => exp.id.toString() === id.toString());
    if (!expense) return;
    
    isEditingExpense = true;
    currentEditExpenseId = id;
    
    // Fill form with expense data
    document.getElementById('expenseId').value = expense.id;
    document.getElementById('expenseDescription').value = expense.description;
    document.getElementById('expenseAmount').value = expense.amount;
    document.getElementById('expenseCategory').value = expense.category;
    
    // Update UI for editing mode
    document.getElementById('expenseSubmitBtn').textContent = 'Update Expense';
    document.getElementById('expenseCancelBtn').style.display = 'inline-block';
    document.querySelector('.form-label').textContent = 'Edit Expense';
    
    // Scroll to form
    document.getElementById('expenseForm').scrollIntoView({ behavior: 'smooth' });
}

// Cancel Edit Function
function cancelEdit() {
    isEditingExpense = false;
    currentEditExpenseId = null;
    
    // Reset form
    document.getElementById('expenseForm').reset();
    document.getElementById('expenseId').value = '';
    
    // Update UI back to add mode
    document.getElementById('expenseSubmitBtn').textContent = 'Add Expense';
    document.getElementById('expenseCancelBtn').style.display = 'none';
    document.querySelector('.form-label').textContent = 'Add New Expense';
}

// Delete Expense Function
async function deleteExpense(id) {
    if (confirm('Are you sure you want to delete this expense?')) {
        try {
            // Convert id to number for consistent comparison
            const expenseId = typeof id === 'string' ? parseInt(id) : id;
            
            // Remove from local array
            expenses = expenses.filter(expense => {
                const currentExpenseId = typeof expense.id === 'string' ? parseInt(expense.id) : expense.id;
                return currentExpenseId !== expenseId;
            });
            
            // Delete from Firestore
            await deleteExpenseFromFirestore(expenseId);
            
            // Update UI
            updateSummary();
            renderExpenses();
            
            // Show success message
            showSuccess('expenseForm', 'Expense deleted successfully!');
            
        } catch (error) {
            console.error('Error deleting expense:', error);
            showError('expenseForm', 'Failed to delete expense. Please try again.');
            // Reload expenses from Firestore to ensure consistency
            await loadExpensesFromFirestore();
            updateSummary();
            renderExpenses();
        }
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
                <div class="expense-actions">
                    <span class="expense-category">${getCategoryIcon(expense.category)} ${formatCategoryName(expense.category)}</span>
                    <span class="expense-amount">${formatNaira(expense.amount)}</span>
                    <button class="edit-expense-btn" onclick="editExpense('${expense.id}')">Edit</button>
                    <button class="delete-btn" onclick="deleteExpense('${expense.id}')">Delete</button>
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

// Budget Edit Functions
function showEditBudgetModal() {
    const modal = document.getElementById('editBudgetModal');
    const currentBudgetInput = document.getElementById('editBudgetAmount');
    
    if (modal && currentBudgetInput) {
        currentBudgetInput.value = monthlyBudget;
        modal.style.display = 'flex';
    }
}

function hideEditBudgetModal() {
    const modal = document.getElementById('editBudgetModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Clear any error messages
    document.querySelectorAll('.error-message').forEach(el => el.remove());
}

async function updateBudget() {
    const newBudgetInput = document.getElementById('editBudgetAmount');
    const newBudget = parseFloat(newBudgetInput.value);
    
    // Clear previous errors
    document.querySelectorAll('.error-message').forEach(el => el.remove());
    
    if (!newBudget || newBudget <= 0) {
        showError('editBudgetAmount', 'Please enter a valid budget amount (minimum ₦1,000)');
        return;
    }
    
    if (newBudget < 1000) {
        showError('editBudgetAmount', 'Budget must be at least ₦1,000');
        return;
    }
    
    try {
        // Show loading state
        const updateButton = document.querySelector('#editBudgetModal .update-btn');
        const originalText = updateButton.textContent;
        updateButton.textContent = 'Updating...';
        updateButton.disabled = true;
        
        // Update in Firestore
        await updateUserBudgetInFirestore(newBudget);
        
        // Update local state
        monthlyBudget = newBudget;
        
        // Update UI
        document.getElementById('monthlyBudget').textContent = formatNaira(monthlyBudget);
        updateSummary();
        
        // Show success message
        showSuccess('editBudgetForm', 'Budget updated successfully!');
        
        // Hide modal after a short delay
        setTimeout(() => {
            hideEditBudgetModal();
        }, 1500);
        
    } catch (error) {
        console.error('Error updating budget:', error);
        showError('editBudgetAmount', 'Failed to update budget. Please try again.');
    } finally {
        // Reset button state
        const updateButton = document.querySelector('#editBudgetModal .update-btn');
        updateButton.textContent = 'Update Budget';
        updateButton.disabled = false;
    }
}

// Handle escape key to close modal
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        hideEditBudgetModal();
    }
});

// Navigation Functions
function showDashboard() {
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    if (event && event.target) event.target.classList.add('active');
}

// Make functions globally available for onclick handlers
window.deleteExpense = deleteExpense;
window.editExpense = editExpense;
window.cancelEdit = cancelEdit;
window.showEditBudgetModal = showEditBudgetModal;
window.hideEditBudgetModal = hideEditBudgetModal;
window.updateBudget = updateBudget;

// [Previous JavaScript remains the same until the end of the file]

// Analytics Functions
let budgetChart, categoryChart, monthlyTrendChart;

function showAnalytics() {
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('analyticsView').style.display = 'block';
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateAnalytics();
}

function updateAnalytics() {
    const timePeriod = document.getElementById('timePeriod').value;
    renderBudgetChart(timePeriod);
    renderCategoryChart(timePeriod);
    renderMonthlyTrendChart(timePeriod);
    renderTopExpenses(timePeriod);
    renderCategoryDistribution(timePeriod);
}

function renderBudgetChart(timePeriod) {
    const ctx = document.getElementById('budgetChart').getContext('2d');
    const filteredExpenses = filterExpensesByTimePeriod(timePeriod);
    const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    
    if (budgetChart) {
        budgetChart.destroy();
    }
    
    budgetChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Remaining Budget', 'Expenses'],
            datasets: [{
                data: [Math.max(0, monthlyBudget - totalExpenses), totalExpenses],
                backgroundColor: [
                    '#4caf50',
                    '#ff6b6b'
                ],
                borderColor: [
                    'rgba(255, 255, 255, 0.2)',
                    'rgba(255, 255, 255, 0.2)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'white'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += formatNaira(context.raw);
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderCategoryChart(timePeriod) {
    const ctx = document.getElementById('categoryChart').getContext('2d');
    const filteredExpenses = filterExpensesByTimePeriod(timePeriod);
    
    const categories = {
        'academic': 0,
        'food': 0,
        'entertainment': 0,
        'transportation': 0,
        'personal': 0,
        'housing': 0,
        'other': 0
    };
    
    filteredExpenses.forEach(expense => {
        categories[expense.category] += expense.amount;
    });
    
    const labels = Object.keys(categories).map(cat => formatCategoryName(cat));
    const data = Object.values(categories);
    const backgroundColors = [
        'rgba(75, 192, 192, 0.7)',
        'rgba(54, 162, 235, 0.7)',
        'rgba(255, 99, 132, 0.7)',
        'rgba(255, 159, 64, 0.7)',
        'rgba(153, 102, 255, 0.7)',
        'rgba(255, 206, 86, 0.7)',
        'rgba(201, 203, 207, 0.7)'
    ];
    
    if (categoryChart) {
        categoryChart.destroy();
    }
    
    categoryChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: backgroundColors,
                borderColor: 'rgba(255, 255, 255, 0.2)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: 'white'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
                            label += formatNaira(context.raw);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((context.raw / total) * 100);
                            label += ` (${percentage}%)`;
                            return label;
                        }
                    }
                }
            }
        }
    });
}

function renderMonthlyTrendChart(timePeriod) {
    const ctx = document.getElementById('monthlyTrendChart').getContext('2d');
    const currentDate = new Date();
    const months = [];
    const monthlyData = [];
    
    // Determine how many months to show
    let monthCount = 6; // Default to 6 months
    if (timePeriod === 'year') monthCount = 12;
    if (timePeriod === 'all') {
        if (expenses.length > 0) {
            const firstExpenseDate = new Date(expenses[expenses.length - 1].date);
            monthCount = (currentDate.getFullYear() - firstExpenseDate.getFullYear()) * 12 + 
                         (currentDate.getMonth() - firstExpenseDate.getMonth()) + 1;
            monthCount = Math.max(6, monthCount); // Show at least 6 months
            monthCount = Math.min(24, monthCount); // Cap at 24 months
        }
    }
    
    // Prepare data for each month
    for (let i = monthCount - 1; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        
        const monthName = date.toLocaleString('default', { month: 'short' });
        const year = date.getFullYear();
        months.push(`${monthName} ${year}`);
        
        const monthExpenses = expenses.filter(expense => {
            const expenseDate = new Date(expense.date);
            return expenseDate.getMonth() === date.getMonth() && 
                   expenseDate.getFullYear() === date.getFullYear();
        });
        
        const total = monthExpenses.reduce((sum, expense) => sum + expense.amount, 0);
        monthlyData.push(total);
    }
    
    if (monthlyTrendChart) {
        monthlyTrendChart.destroy();
    }
    
    monthlyTrendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Monthly Expenses',
                data: monthlyData,
                backgroundColor: 'rgba(102, 126, 234, 0.2)',
                borderColor: 'rgba(102, 126, 234, 1)',
                borderWidth: 2,
                tension: 0.3,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: 'white'
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Expenses: ${formatNaira(context.raw)}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        callback: function(value) {
                            return formatNaira(value);
                        }
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: 'rgba(255, 255, 255, 0.7)'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
}

function renderTopExpenses(timePeriod) {
    const filteredExpenses = filterExpensesByTimePeriod(timePeriod);
    const sortedExpenses = [...filteredExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const container = document.getElementById('topExpensesList');
    
    if (sortedExpenses.length === 0) {
        container.innerHTML = '<p style="color: white; text-align: center;">No expenses found</p>';
        return;
    }
    
    container.innerHTML = sortedExpenses.map(expense => `
        <div class="top-expense-item">
            <div>
                <div class="expense-title">${expense.description}</div>
                <div class="expense-date">${expense.dateFormatted}</div>
            </div>
            <div class="expense-amount">${formatNaira(expense.amount)}</div>
        </div>
    `).join('');
}

function renderCategoryDistribution(timePeriod) {
    const filteredExpenses = filterExpensesByTimePeriod(timePeriod);
    const categories = {
        'academic': 0,
        'food': 0,
        'entertainment': 0,
        'transportation': 0,
        'personal': 0,
        'housing': 0,
        'other': 0
    };
    
    filteredExpenses.forEach(expense => {
        categories[expense.category] += expense.amount;
    });
    
    const total = filteredExpenses.reduce((sum, expense) => sum + expense.amount, 0);
    const container = document.getElementById('categoryDistribution');
    
    if (total === 0) {
        container.innerHTML = '<p style="color: white; text-align: center;">No expenses found</p>';
        return;
    }
    
    container.innerHTML = Object.entries(categories)
        .filter(([_, amount]) => amount > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([category, amount]) => {
            const percentage = Math.round((amount / total) * 100);
            return `
                <div class="category-dist-item">
                    <div class="category-dist-name">
                        ${getCategoryIcon(category)} ${formatCategoryName(category)}
                    </div>
                    <div class="category-dist-bar">
                        <div class="category-dist-progress" style="width: ${percentage}%"></div>
                    </div>
                    <div class="category-dist-amount">${percentage}%</div>
                </div>
            `;
        }).join('');
}

function filterExpensesByTimePeriod(timePeriod) {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();
    
    switch (timePeriod) {
        case 'month':
            return expenses.filter(expense => {
                const expenseDate = new Date(expense.date);
                return expenseDate.getMonth() === currentMonth && 
                       expenseDate.getFullYear() === currentYear;
            });
        case 'year':
            return expenses.filter(expense => {
                const expenseDate = new Date(expense.date);
                return expenseDate.getFullYear() === currentYear;
            });
        case 'all':
            return [...expenses];
        default:
            return [];
    }
}


function showDashboard() {
    document.getElementById('dashboardView').style.display = 'block';
    document.getElementById('analyticsView').style.display = 'none';
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
}

function showAnalytics() {
    document.getElementById('dashboardView').style.display = 'none';
    document.getElementById('analyticsView').style.display = 'block';
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    updateAnalytics();
}

// [Rest of the JavaScript code remains the same]
// [Rest of the previous JavaScript remains the same]