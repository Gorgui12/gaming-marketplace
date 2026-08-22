interface TicketStubProps {
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  reference: string;
  status: 'pending' | 'active' | 'complete';
}

const STATUS_LABEL: Record<TicketStubProps['status'], string> = {
  pending: 'En attente',
  active: 'Sécurisé',
  complete: 'Terminé',
};

const STATUS_COLOR: Record<TicketStubProps['status'], string> = {
  pending: 'text-bone/50',
  active: 'text-mint',
  complete: 'text-gold',
};

/**
 * Le talon de billet perforé — signature visuelle du produit. Une
 * transaction = deux moitiés (acheteur/vendeur) reliées par une ligne de
 * perforation, qui ne se "détache" (COMPLETED) qu'une fois les deux
 * confirmations obtenues.
 */
export function TicketStub({
  leftLabel,
  leftValue,
  rightLabel,
  rightValue,
  reference,
  status,
}: TicketStubProps) {
  return (
    <div className="ticket-notch flex overflow-hidden rounded-ticket border border-white/10 bg-navy-mid shadow-2xl shadow-black/30">
      <div className="min-w-0 flex-1 p-4 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">
          {leftLabel}
        </p>
        <p className="mt-1 truncate font-display text-xl text-bone sm:text-2xl">{leftValue}</p>
      </div>
      <div className="relative w-px bg-perforation-v" />
      <div className="w-32 shrink-0 bg-navy-soft p-4 sm:w-40 sm:p-6">
        <p className="font-mono text-[11px] uppercase tracking-widest text-bone/40">
          {rightLabel}
        </p>
        <p className="mt-1 font-display text-lg text-bone sm:text-xl">{rightValue}</p>
        <p className={`mt-3 font-mono text-[11px] uppercase tracking-widest sm:mt-4 ${STATUS_COLOR[status]}`}>
          ● {STATUS_LABEL[status]}
        </p>
        <p className="mt-1 font-mono text-[10px] text-bone/30">{reference}</p>
      </div>
    </div>
  );
}
