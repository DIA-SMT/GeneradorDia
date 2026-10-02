import Image from "next/image";

export function Encabezado() {
  return (
    <header className="no-imprimir">
      <div className="franja-smt">
        <div className="mx-auto flex max-w-[1500px] items-center gap-4 px-4 py-3 sm:px-6">
          <Image
            src="/logo-smt-blanco.png"
            alt="Ciudad de San Miguel de Tucumán"
            width={507}
            height={206}
            priority
            className="h-9 w-auto sm:h-10"
          />
          <div className="h-8 w-px bg-white/30" aria-hidden />
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold leading-tight text-white sm:text-lg">
              Generador de Notas
            </h1>
            <p className="truncate text-xs text-sky-100 sm:text-[13px]">
              Redacción administrativa asistida por IA
            </p>
          </div>
          <div className="ml-auto hidden items-center rounded-lg bg-white px-2.5 py-1.5 shadow-sm sm:flex">
            <Image src="/logo-ia.png" alt="Dirección de IA" width={526} height={220} className="h-6 w-auto" />
          </div>
        </div>
      </div>
      <div className="linea-smt" />
    </header>
  );
}
