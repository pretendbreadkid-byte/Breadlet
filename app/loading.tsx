export default function Loading() {
  return (
    <div className="breadlet-loading" role="status" aria-live="polite">
      <div className="breadlet-spinner" />
      <p>Loading Breadlet…</p>
    </div>
  );
}
