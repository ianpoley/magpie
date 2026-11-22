export function FormAlert({ message }: { message: string }) {
  return (
    <p role="alert" className="rounded-inner bg-like-soft px-3 py-2.5 text-[13px] leading-snug text-like-text">
      {message}
    </p>
  );
}
