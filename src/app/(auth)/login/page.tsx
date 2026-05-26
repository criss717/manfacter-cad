export default function LoginPage() {
  return (
    <div className="min-h-screen bg-fog flex items-center justify-center">
      <div className="bg-snow rounded-[28px] p-8 w-full max-w-100">
        <h1 className="text-heading-sm font-bold text-ink tracking-tight mb-2">
          Iniciar sesión
        </h1>
        <p className="text-caption text-graphite mb-6">
          Próximamente — autenticación con Google
        </p>
        <div className="h-11 rounded-full bg-fog animate-pulse" />
      </div>
    </div>
  );
}
