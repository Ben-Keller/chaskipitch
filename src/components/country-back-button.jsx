export function CountryBackButton({ onBack }) {
  return (
    <button type="button" onClick={onBack} className="back-button">
      Return to world map
    </button>
  );
}
