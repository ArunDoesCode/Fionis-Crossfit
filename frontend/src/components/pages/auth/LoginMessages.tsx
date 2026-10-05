interface LoginMessagesProps {
  /** What the server said about the try (wrong password, locked): red. */
  error: string | null;
  /** "Please sign in again." after an ended sign-in (BR-REC-41). */
  notice: string | null;
}

// One line for the server's answer; its space is always kept so nothing jumps (two lines). Both regions
// are always in the page and only their text changes, so a screen reader announces it (BR-REC-137).
export default function LoginMessages({ error, notice }: LoginMessagesProps) {
  return (
    <div className="min-h-12 text-base">
      <p role="alert" className="text-destructive">
        {error}
      </p>
      <p role="status">{notice}</p>
    </div>
  );
}
