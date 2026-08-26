// src/views/log-panel.js
function renderLogPanel(container, { results }) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Ergebnis</h1>';
  container.appendChild(header);

  for (const result of results) {
    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = `${result.track_name}: ${result.status}`;
    container.appendChild(line);
  }

  const restartBtn = document.createElement('button');
  restartBtn.textContent = 'Neu scannen';
  restartBtn.addEventListener('click', () => main());
  container.appendChild(restartBtn);
}
