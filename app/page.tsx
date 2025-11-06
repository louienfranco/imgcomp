import ImgComp from "@/components/custom/imgcomp";
import { ModeToggle } from "@/components/theme/toggle-mode";
import Footer from "@/components/custom/footer";

export default function Page() {
  return (
    <main>
      <ModeToggle />
      <ImgComp />
      <Footer />
    </main>
  );
}
