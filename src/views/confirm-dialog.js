// src/views/confirm-dialog.js
function renderConfirmDialog(container, { plan, onConfirm, onCancel }) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Vorschau</h1>';
  container.appendChild(header);

  for (const item of plan) {
    const row = document.createElement('div');
    row.className = 'track-row';

    const label = document.createElement('span');
    if (item.warnings.length > 0) {
      label.textContent = `${item.track_name} — übersprungen: ${item.warnings.join(' ')}`;
      label.className = 'warning';
    } else {
      label.textContent = `${item.track_name} → ${item.target_path}`;
    }
    row.appendChild(label);
    container.appendChild(row);
  }

  const actions = document.createElement('div');

  const confirmBtn = document.createElement('button');
  confirmBtn.textContent = 'Ausführen';
  confirmBtn.addEventListener('click', onConfirm);
  actions.appendChild(confirmBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Zurück';
  cancelBtn.addEventListener('click', onCancel);
  actions.appendChild(cancelBtn);

  container.appendChild(actions);
}
