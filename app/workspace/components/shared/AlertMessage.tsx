interface AlertMessageProps {
  message: string;
  successKeyword?: string;
}

export function AlertMessage({ message, successKeyword = "updated" }: AlertMessageProps) {
  const isSuccess = message.includes(successKeyword);
  
  return (
    <p className={`text-sm ${isSuccess ? "text-emerald-600" : "text-red-600"}`}>
      {message}
    </p>
  );
}
