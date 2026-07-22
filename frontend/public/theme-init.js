(function () {
  try {
    var stored = localStorage.getItem("ai-anime-app");
    var theme = "dark";
    if (stored) {
      var parsed = JSON.parse(stored);
      if (parsed && parsed.state && parsed.state.theme) {
        theme = parsed.state.theme === "light" ? "light" : "dark";
      }
    }
    document.documentElement.classList.add(theme);
    if (window.location.pathname === "/login") {
      document.documentElement.classList.add("preauth-shell");
      document.documentElement.style.backgroundColor =
        theme === "light" ? "#f4f4f5" : "#18181b";
    }
  } catch (_error) {
    document.documentElement.classList.add("dark");
  }
})();
