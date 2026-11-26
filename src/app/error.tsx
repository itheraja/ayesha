'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Let’s try that again.</h1>
      <p>The page encountered an error. No appointment success is implied.</p>
      <button className="primary" onClick={reset}>
        Reload experience
      </button>
    </main>
  );
}
