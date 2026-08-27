// Copyright (c) 2026 AI anime
import "@fontsource-variable/inter";
import "./i18n";
import "./index.css";

import {
  bootstrapApplication,
  renderBootstrapFailure,
} from "@/app/bootstrap";

void bootstrapApplication().catch(renderBootstrapFailure);
