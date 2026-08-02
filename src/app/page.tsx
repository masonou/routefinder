import { SearchForm } from "../components/SearchForm";

export default function Home() {
  return (
    <main className="min-h-screen bg-stone-50 px-4 py-10 text-stone-950 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Routefinder</h1>
          <p className="text-sm text-stone-700">Turn a long trip into a stopover.</p>
        </header>

        <SearchForm />
      </div>
    </main>
  );
}
