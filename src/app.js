// src/app.js
async function main() {
  const app = document.getElementById('app');
  const settings = await window.djApi.getSettings();
  const { tracks } = await window.djApi.scan();

  const app_ = app; // keep reference for nested closures
  const wrapper = document.createElement('div');
  const settingsBtn = document.createElement('button');
  settingsBtn.className = 'secondary';
  settingsBtn.textContent = 'Einstellungen';
  settingsBtn.addEventListener('click', () => {
    renderSettings(app_, {
      settings,
      onSave: async (newSettings) => {
        await window.djApi.saveSettings(newSettings);
        main();
      },
      onCancel: () => main(),
    });
  });

  renderTrackList(app, {
    tracks,
    knownGenres: settings.known_genres,
    onSubmit: async (genreChoices) => {
      const { plan } = await window.djApi.plan(genreChoices);
      renderConfirmDialog(app, {
        plan,
        onConfirm: async () => {
          const { results } = await window.djApi.execute();
          renderLogPanel(app, { results });
        },
        onCancel: () => main(),
      });
    },
  });

  app.querySelector('header.app-header').appendChild(settingsBtn);

  window.djApi.onSidecarCrash(() => {
    app.innerHTML = '<p class="warning">Backend-Prozess abgestürzt. Bitte App neu starten.</p>';
  });
}

main();
