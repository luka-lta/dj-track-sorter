// src/app.js
function renderError(app, message, { onRetry, onSettings } = {}) {
  const msg = document.createElement('p');
  msg.className = 'warning';
  msg.textContent = message;
  app.appendChild(msg);

  if (onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Erneut versuchen';
    retryBtn.addEventListener('click', onRetry);
    app.appendChild(retryBtn);
  }

  if (onSettings) {
    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'secondary';
    settingsBtn.textContent = 'Einstellungen';
    settingsBtn.addEventListener('click', onSettings);
    app.appendChild(settingsBtn);
  }
}

function openSettings(app, settings) {
  renderSettings(app, {
    settings,
    onSave: async (newSettings) => {
      await window.djApi.saveSettings(newSettings);
      main();
    },
    onCancel: () => main(),
  });
}

async function main() {
  const app = document.getElementById('app');
  app.innerHTML = '';

  let settings;
  try {
    settings = await window.djApi.getSettings();
  } catch (err) {
    renderError(app, 'Fehler beim Laden der Einstellungen: ' + err.message, {
      onRetry: () => main(),
    });
    return;
  }

  // Header + Einstellungen-Button werden vor dem scan()-Aufruf angehängt,
  // damit sie auch bei einem fehlschlagenden Scan erreichbar bleiben.
  const header = document.createElement('header');
  header.className = 'app-header';
  header.innerHTML = '<h1>Neue Tracks</h1>';
  app.appendChild(header);

  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'secondary';
  settingsBtn.textContent = 'Einstellungen';
  settingsBtn.addEventListener('click', () => openSettings(app, settings));
  header.appendChild(settingsBtn);

  let scanResult;
  try {
    scanResult = await window.djApi.scan();
  } catch (err) {
    renderError(app, 'Fehler beim Scannen: ' + err.message, {
      onRetry: () => main(),
    });
    return;
  }

  const { tracks, neu_dir_missing: neuDirMissing } = scanResult;

  renderTrackList(app, {
    tracks,
    knownGenres: settings.known_genres,
    neuDirMissing,
    onSubmit: async (genreChoices) => {
      let plan;
      try {
        ({ plan } = await window.djApi.plan(genreChoices));
      } catch (err) {
        app.innerHTML = '';
        renderError(app, 'Fehler bei der Vorschau: ' + err.message, {
          onRetry: () => main(),
          onSettings: () => openSettings(app, settings),
        });
        return;
      }

      renderConfirmDialog(app, {
        plan,
        onConfirm: async () => {
          try {
            const { results } = await window.djApi.execute(genreChoices);
            renderLogPanel(app, { results });
          } catch (err) {
            app.innerHTML = '';
            renderError(app, 'Fehler beim Ausführen: ' + err.message, {
              onRetry: () => main(),
              onSettings: () => openSettings(app, settings),
            });
          }
        },
        onCancel: () => main(),
      });
    },
  });

  // Nach renderTrackList() wurde app.innerHTML neu aufgebaut (eigener Header),
  // daher den Einstellungen-Button erneut anhängen.
  app.querySelector('header.app-header').appendChild(settingsBtn);

  window.djApi.onSidecarCrash(() => {
    app.innerHTML = '<p class="warning">Backend-Prozess abgestürzt. Bitte App neu starten.</p>';
  });
}

main().catch((err) => {
  document.getElementById('app').textContent = 'Unerwarteter Fehler: ' + err.message;
});
