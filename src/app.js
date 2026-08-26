// src/app.js
async function main() {
  const app = document.getElementById('app');
  const settings = await window.djApi.getSettings();
  const { tracks } = await window.djApi.scan();

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

  window.djApi.onSidecarCrash(() => {
    app.innerHTML = '<p class="warning">Backend-Prozess abgestürzt. Bitte App neu starten.</p>';
  });
}

main();
