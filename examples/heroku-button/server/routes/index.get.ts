import { defineEventHandler, setHeader } from 'nitro/h3';

const page = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Workflow Heroku Demo</title>
    <style>
      :root { color-scheme: light dark; font: 16px/1.5 system-ui, sans-serif; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; }
      main { width: min(42rem, calc(100% - 2rem)); }
      button, input { box-sizing: border-box; font: inherit; padding: .7rem .9rem; }
      input { width: 100%; margin-block: .5rem 1rem; }
      button { cursor: pointer; }
      pre { min-height: 8rem; overflow: auto; padding: 1rem; border: 1px solid #8886; border-radius: .5rem; }
    </style>
  </head>
  <body>
    <main>
      <h1>Workflow Heroku Demo</h1>
      <p>This app runs a durable two-step Workflow DevKit workflow using the personal, unofficial Heroku World and Heroku Postgres.</p>
      <label for="message">Workflow message</label>
      <input id="message" value="Hello from Heroku">
      <button id="run" type="button">Run durable workflow</button>
      <pre id="result" aria-live="polite">Ready.</pre>
      <p><a href="https://github.com/dsouzaAnush/world-heroku">Source and documentation</a></p>
    </main>
    <script>
      const button = document.querySelector('#run');
      const output = document.querySelector('#result');
      button.addEventListener('click', async () => {
        button.disabled = true;
        output.textContent = 'Starting workflow...';
        try {
          const response = await fetch('/api/runs', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ message: document.querySelector('#message').value }),
          });
          let run = await response.json();
          if (!response.ok) throw new Error(JSON.stringify(run));
          output.textContent = JSON.stringify(run, null, 2);
          while (run.status !== 'completed' && run.status !== 'failed') {
            await new Promise((resolve) => setTimeout(resolve, 500));
            const statusResponse = await fetch(run.statusUrl);
            run = await statusResponse.json();
            if (!statusResponse.ok) throw new Error(JSON.stringify(run));
            output.textContent = JSON.stringify(run, null, 2);
          }
        } catch (error) {
          output.textContent = String(error);
        } finally {
          button.disabled = false;
        }
      });
    </script>
  </body>
</html>`;

export default defineEventHandler((event) => {
  setHeader(event, 'content-type', 'text/html; charset=utf-8');
  return page;
});
