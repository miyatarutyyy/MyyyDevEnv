;;; early-init.el --- Early package setup -*- lexical-binding: t; -*-

;; Keep package.el from activating packages before straight.el reads the
;; version lockfile in init.el.  straight.el is the sole external package
;; manager for this configuration.
(setq package-enable-at-startup nil)

;;; early-init.el ends here
