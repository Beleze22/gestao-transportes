import { useState } from "react";

export default function ModalQuickAdd({ modal, onClose }) {
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (!modal) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    await modal.onConfirm(values);
    setSubmitting(false);
    onClose();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <h3>{modal.title}</h3>
        <form onSubmit={handleSubmit}>
          {modal.fields.map((field, i) => (
            <div key={field.key}>
              <label>{field.label}:</label>
              <input
                type="text"
                placeholder={field.placeholder}
                value={values[field.key] || ""}
                onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
                required
                autoFocus={i === 0}
              />
            </div>
          ))}
          <div className="modal-actions">
            <button type="button" className="btn-cancel" onClick={onClose} disabled={submitting}>
              Cancelar
            </button>
            <button type="submit" className="btn-save" disabled={submitting}>
              {submitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
