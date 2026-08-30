import { SearchForm } from "../components/SearchForm";

export default function Home() {
  return (
    <main className="min-h-svh bg-[#f7f8fa] text-slate-950">
      <div className="mx-auto flex min-h-svh w-full max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
        <header className="flex h-18 items-center" aria-label="Slow Layover">
          <p className="text-lg font-semibold tracking-tight text-slate-950">
            Slow Layover (Beta)
          </p>
        </header>

        <section className="flex flex-1 justify-center py-10 sm:py-14 lg:pb-16 lg:pt-24">
          <div className="w-full max-w-5xl">
            <h1 className="mx-auto max-w-3xl text-center text-3xl font-semibold tracking-[-0.03em] text-slate-950 sm:text-4xl lg:text-5xl lg:leading-tight">
              Turn a long flight into a stopover adventure.
            </h1>
            <div className="mt-7 w-full sm:mt-8">
              <SearchForm />
            </div>
          </div>
        </section>

        <footer className="mx-auto w-full max-w-5xl py-6 text-center text-sm text-slate-500">
          Built for the journey.
        </footer>
      </div>
    </main>
  );
}
