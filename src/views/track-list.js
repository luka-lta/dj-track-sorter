// src/views/track-list.js
let _previewAudio = null;
let _previewButton = null;

function _toFileUrl(path) {
  return 'file://' + path.split('/').map(encodeURIComponent).join('/');
}

function _stopPreview() {
  if (_previewAudio) {
    _previewAudio.pause();
    _previewAudio = null;
  }
  if (_previewButton) {
    _previewButton.textContent = '▶';
    _previewButton = null;
  }
}

function _togglePreview(track, button) {
  const isThisTrackPlaying = _previewButton === button;
  _stopPreview();
  if (isThisTrackPlaying) return;

  const audio = new Audio(_toFileUrl(track.track_path));
  audio.addEventListener('ended', () => _stopPreview());
  audio.play();
  button.textContent = '⏸';
  _previewAudio = audio;
  _previewButton = button;
}

function renderTrackList(container, { tracks, knownGenres, onSubmit, neuDirMissing }) {
  _stopPreview();
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

    const playBtn = document.createElement('button');
    playBtn.className = 'secondary preview-btn';
    playBtn.textContent = '▶';
    playBtn.addEventListener('click', () => _togglePreview(track, playBtn));
    row.appendChild(playBtn);

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
  submitBtn.addEventListener('click', () => {
    _stopPreview();
    onSubmit(choices);
  });
  container.appendChild(submitBtn);
}
