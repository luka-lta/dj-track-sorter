// src/views/settings.js
function renderSettings(container, { settings, onSave, onCancel }) {
  container.innerHTML = '';
  const state = { ...settings, known_genres: [...settings.known_genres] };

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Einstellungen</h1>';
  container.appendChild(header);

  function folderRow(label, key) {
    const row = document.createElement('div');
    row.className = 'track-row';
    const text = document.createElement('span');
    text.textContent = `${label}: ${state[key]}`;
    row.appendChild(text);
    const btn = document.createElement('button');
    btn.className = 'secondary';
    btn.textContent = 'Ändern';
    btn.addEventListener('click', async () => {
      const picked = await window.djApi.pickFolder();
      if (picked) {
        state[key] = picked;
        text.textContent = `${label}: ${state[key]}`;
      }
    });
    row.appendChild(btn);
    container.appendChild(row);
  }

  folderRow('Neu-Ordner', 'neu_dir');
  folderRow('DJ-Root', 'dj_root');

  const genresRow = document.createElement('div');
  genresRow.className = 'track-row';
  const genresText = document.createElement('span');
  genresText.textContent = state.known_genres.length > 0
    ? `Genres: ${state.known_genres.join(', ')}`
    : 'Genres: (noch nicht synchronisiert)';
  genresRow.appendChild(genresText);

  const syncBtn = document.createElement('button');
  syncBtn.className = 'secondary';
  syncBtn.textContent = 'Jetzt synchronisieren';
  syncBtn.addEventListener('click', async () => {
    syncBtn.disabled = true;
    try {
      const { known_genres: syncedGenres } = await window.djApi.syncGenres();
      state.known_genres = syncedGenres;
      genresText.textContent = syncedGenres.length > 0
        ? `Genres: ${syncedGenres.join(', ')}`
        : 'Genres: (keine "Genre"-MyTags in rekordbox gefunden)';
    } catch (err) {
      genresText.textContent = 'Fehler beim Synchronisieren: ' + err.message;
    } finally {
      syncBtn.disabled = false;
    }
  });
  genresRow.appendChild(syncBtn);
  container.appendChild(genresRow);

  const dryRunRow = document.createElement('div');
  dryRunRow.className = 'track-row';
  const dryRunLabel = document.createElement('label');
  const dryRunCheckbox = document.createElement('input');
  dryRunCheckbox.type = 'checkbox';
  dryRunCheckbox.checked = state.dry_run;
  dryRunCheckbox.addEventListener('change', () => { state.dry_run = dryRunCheckbox.checked; });
  dryRunLabel.appendChild(dryRunCheckbox);
  dryRunLabel.appendChild(document.createTextNode(' DRY RUN (nichts schreiben, nur simulieren)'));
  dryRunRow.appendChild(dryRunLabel);
  container.appendChild(dryRunRow);

  const actions = document.createElement('div');
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Speichern';
  saveBtn.addEventListener('click', () => onSave(state));
  actions.appendChild(saveBtn);

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Abbrechen';
  cancelBtn.addEventListener('click', onCancel);
  actions.appendChild(cancelBtn);

  container.appendChild(actions);
}
