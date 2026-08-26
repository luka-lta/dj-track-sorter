// src/views/track-list.js
function renderTrackList(container, { tracks, knownGenres, onSubmit, neuDirMissing }) {
  container.innerHTML = '';

  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Neue Tracks</h1>';
  container.appendChild(header);

  if (tracks.length === 0) {
    const empty = document.createElement('p');
    empty.className = neuDirMissing ? 'warning' : '';
    empty.textContent = neuDirMissing
      ? 'Der Neu-Ordner existiert nicht. Bitte in den Einstellungen einen gültigen Ordner auswählen.'
      : 'Keine neuen Tracks gefunden.';
    container.appendChild(empty);
    return;
  }

  const choices = {};

  for (const track of tracks) {
    const row = document.createElement('div');
    row.className = 'track-row';

    const name = document.createElement('span');
    name.textContent = track.track_name;
    row.appendChild(name);

    if (track.detected_genre) {
      const badge = document.createElement('span');
      badge.className = 'genre-badge';
      badge.textContent = track.detected_genre;
      row.appendChild(badge);
    } else {
      const select = document.createElement('select');
      const skipOption = document.createElement('option');
      skipOption.value = '';
      skipOption.textContent = 'Überspringen';
      select.appendChild(skipOption);
      for (const genre of knownGenres) {
        const opt = document.createElement('option');
        opt.value = genre;
        opt.textContent = genre;
        select.appendChild(opt);
      }
      select.addEventListener('change', () => {
        if (select.value) choices[track.track_name] = select.value;
        else delete choices[track.track_name];
      });
      row.appendChild(select);
    }

    container.appendChild(row);
  }

  const submitBtn = document.createElement('button');
  submitBtn.textContent = 'Vorschau';
  submitBtn.addEventListener('click', () => onSubmit(choices));
  container.appendChild(submitBtn);
}
