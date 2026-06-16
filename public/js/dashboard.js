function updateDashboardClock() {
    const now = new Date();
    const pad = value => String(value).padStart(2, '0');
    const clock = document.getElementById('clockTime');
    const navbarDate = document.getElementById('clockDate');
    const dashboardDate = document.getElementById('dashboardDate');
    const formattedDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;

    if (clock) clock.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    if (navbarDate) navbarDate.textContent = formattedDate;
    if (dashboardDate) dashboardDate.textContent = formattedDate;
}

updateDashboardClock();
setInterval(updateDashboardClock, 1000);

function toggleDashboardNotifications(event) {
    event.stopPropagation();
    const panel = document.getElementById('notificationPanel');
    const bell = document.getElementById('notificationBell');
    if (!panel || !bell) return;

    const isOpen = panel.classList.toggle('show');
    bell.classList.toggle('active', isOpen);
}

function closeDashboardNotifications() {
    document.getElementById('notificationPanel')?.classList.remove('show');
    document.getElementById('notificationBell')?.classList.remove('active');
}

document.addEventListener('click', event => {
    if (!event.target.closest('#notificationWrap')) closeDashboardNotifications();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closeDashboardNotifications();
});

(function showBirthdayCelebration() {
    const effects = document.getElementById('celebrationEffects');
    if (!effects) return;

    const symbols = ['🎉', '🎊', '✨', '🎂', '⭐'];
    for (let index = 0; index < 24; index++) {
        const particle = document.createElement('span');
        particle.className = 'celebration-particle';
        particle.textContent = symbols[index % symbols.length];
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.setProperty('--duration', `${3 + Math.random() * 2}s`);
        particle.style.setProperty('--drift', `${-70 + Math.random() * 140}px`);
        particle.style.animationDelay = `${Math.random()}s`;
        effects.appendChild(particle);
    }

    setTimeout(() => effects.remove(), 6000);
})();
