import { SearchForm } from "../components/SearchForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
        <header className="flex h-[4.5rem] items-center" aria-label="Slow Layover">
          <p className="text-lg font-semibold tracking-tight text-slate-950">Slow Layover</p>
        </header>

        <section className="flex-1 py-10 sm:py-14 lg:py-16">
          <h1 className="text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl lg:text-5xl lg:leading-tight">Turn a long flight into a stopover adventure.</h1>
          <div className="mt-7 w-full sm:mt-8"><SearchForm /></div>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">Tell us where you&apos;re going. We&apos;ll search flexible one-way routes and find places worth stopping for a few days along the way.</p>
        </section>

        <section className="py-12 sm:py-16" aria-labelledby="how-it-works">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Built for the journey</p>
              <h2 id="how-it-works" className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">One journey. More possibilities.</h2>
              <p className="mt-4 max-w-md text-base leading-7 text-slate-600">We look for places you can stop for a few days — not just a few hours at an airport.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl bg-slate-100 shadow-sm sm:grid-cols-2">
              <div className="bg-white p-5 sm:p-6">
                <p className="text-sm font-semibold text-slate-500">Direct</p>
                <p className="mt-6 text-lg font-semibold text-slate-950">Brisbane <span className="text-slate-400">→</span> Larnaca</p>
                <p className="mt-2 text-sm text-slate-600">One flight, straight through.</p>
              </div>
              <div className="bg-white p-5 sm:p-6">
                <p className="text-sm font-semibold text-blue-700">Slow Layover</p>
                <p className="mt-6 text-lg font-semibold text-slate-950">Brisbane <span className="text-slate-400">→</span> Bangkok</p>
                <p className="mt-2 text-sm font-medium text-slate-700">4 nights in Bangkok</p>
                <p className="mt-2 text-lg font-semibold text-slate-950">Bangkok <span className="text-slate-400">→</span> Larnaca</p>
              </div>
            </div>
          </div>
        </section>

        <footer className="py-6 text-sm text-slate-500">Find a little more in the journey.</footer>
      </div>
    </main>
  );
}
