
document.querySelector('.movebar button:nth-child(1)').addEventListener('click', () => {
    window.electronAPI.minimizeWindow();
});

const maximizeButton = document.querySelector('.movebar button:nth-child(2)');
const maximizeButtonico = document.getElementById('minmax');

const movebar = document.querySelector('.container .movebar');

window.electronAPI.onWindowFocus(() => {
    movebar.style.backgroundColor = 'var(--focus)';
});

window.electronAPI.onWindowBlur(() => {
    movebar.style.backgroundColor = 'var(--unfocus)';
});

maximizeButton.addEventListener('click', () => {
    window.electronAPI.maximizeWindow();
});

window.electronAPI.onWindowStateChange((event, isMaximized) => {
    maximizeButtonico.textContent = isMaximized ? 'ad_group' : 'ad';
});

document.querySelector('.movebar button:nth-child(3)').addEventListener('click', () => {
    window.electronAPI.closeWindow();
});