import React from 'react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    description: string;
    onConfirm: () => void;
    onClose: () => void;
    confirmLabel?: string;
    cancelLabel?: string;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
    open,
    title,
    description,
    onConfirm,
    onClose,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
}) => {
    if (!open) return null;

    return (
        <div className="confirm-backdrop" onClick={onClose}>
            <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                <h4>{title}</h4>
                <p>{description}</p>
                <div className="dialog-actions">
                    <button type="button" className="btn-cancel" onClick={onClose}>
                        {cancelLabel}
                    </button>
                    <button type="button" className="btn-confirm" onClick={onConfirm}>
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmDialog;